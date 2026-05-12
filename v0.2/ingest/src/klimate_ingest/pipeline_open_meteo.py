"""End-to-end Open-Meteo pipeline for one place × year range.

Mirrors `pipeline_imd.process_imd_year` for the per-place archive pull:

  1. HTTP GET the daily archive for (lat, lon, y0..y1).
  2. Write a daily Parquet locally; upload under `daily/open_meteo/<slug>/...`.
  3. Upsert per-place `daily_weather` rows (source='open_meteo').
  4. Stamp one `source_provenance` row covering the requested range,
     with `notes` capturing Open-Meteo's snapped grid point + elevation
     so we can audit the spatial offset later.

`source` here is the kundli source tag `open_meteo`. The grid_cells row
for this place must already exist (run `klimate-ingest grid-build-open-meteo`
once before the first ingest).
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pandas as pd

from .logging import get_logger
from .sources.open_meteo import OpenMeteoResult, OpenMeteoSource
from .storage.r2 import R2Client
from .transform.upsert import stamp_provenance, upsert_daily_weather

log = get_logger(__name__)


@dataclass(frozen=True)
class OpenMeteoChunkResult:
    parquet_local: Path
    daily_uri: str | None
    rows_written: int
    provenance_id: int | None
    snapped_lat: float
    snapped_lon: float


def process_open_meteo_place(
    *,
    slug: str,
    lat: float,
    lon: float,
    year_start: int,
    year_end: int,
    scratch_dir: Path,
    license: str,
    citation: str,
    upload: bool = True,
    r2: R2Client | None = None,
    quality: int = 3,
    source: str = "open_meteo",
    chunk_years: int = 10,
    inter_chunk_sleep_ms: int = 500,
) -> OpenMeteoChunkResult:
    """Fetch, write parquet, upsert, and stamp provenance for one place.

    The full year range is sliced into `chunk_years`-wide windows and
    each window is fetched independently. Single-shot 85-year requests
    sometimes trip Open-Meteo's per-IP computational throttle (HTTP 429)
    because each one is heavy to compute on their side; smaller chunks
    consistently succeed. The resulting frames are concatenated before
    upsert / parquet, so the on-disk + DB shape is unchanged.
    """
    scratch_dir.mkdir(parents=True, exist_ok=True)

    src = OpenMeteoSource()
    chunks: list[OpenMeteoResult] = []
    chunk_starts: list[int] = list(range(year_start, year_end + 1, chunk_years))
    for c_start in chunk_starts:
        c_end = min(c_start + chunk_years - 1, year_end)
        log.info(
            "pipeline.open_meteo.chunk.start",
            slug=slug, c_start=c_start, c_end=c_end,
        )
        chunks.append(src.fetch_place(
            lat=lat, lon=lon, year_start=c_start, year_end=c_end,
        ))
        if inter_chunk_sleep_ms > 0 and c_start != chunk_starts[-1]:
            time.sleep(inter_chunk_sleep_ms / 1000.0)

    # Merge chunk frames in chronological order. Open-Meteo returns rows
    # ordered by date within a single response, so a simple concat suffices.
    fetched_df = pd.concat([c.df for c in chunks], ignore_index=True)
    fetched_df = fetched_df.sort_values("date").reset_index(drop=True)
    fetched = OpenMeteoResult(
        snapped_lat=chunks[0].snapped_lat,
        snapped_lon=chunks[0].snapped_lon,
        elevation_m=chunks[0].elevation_m,
        timezone=chunks[0].timezone,
        df=fetched_df,
        payload_bytes=sum(c.payload_bytes for c in chunks),
        request_url=chunks[0].request_url + " (... chunked, see notes)",
    )

    parquet_local = scratch_dir / f"open_meteo_{slug}_{year_start:04d}_{year_end:04d}.parquet"
    fetched.df.to_parquet(parquet_local, index=False)
    log.info(
        "pipeline.open_meteo.parquet.written",
        path=str(parquet_local),
        bytes=parquet_local.stat().st_size,
        rows=len(fetched.df),
    )

    daily_uri: str | None = None
    if upload:
        r2 = r2 or R2Client.from_env()
        daily_key = (
            f"daily/{source}/{slug}/"
            f"{source}_{slug}_{year_start:04d}_{year_end:04d}.parquet"
        )
        daily_uri = r2.upload_file(
            parquet_local, daily_key, content_type="application/x-parquet",
        )

    value_columns = [c for c in ("tmax_c", "tmin_c", "precip_mm") if c in fetched.df.columns]
    rows_written = upsert_daily_weather(
        df=fetched.df,
        source=source,
        value_columns=value_columns,
        source_version=f"{year_start:04d}-{year_end:04d}",
        quality=quality,
    )

    notes = json.dumps(
        {
            "snapped_lat": fetched.snapped_lat,
            "snapped_lon": fetched.snapped_lon,
            "elevation_m": fetched.elevation_m,
            "timezone": fetched.timezone,
            "request_url": fetched.request_url,
            "slug": slug,
        }
    )
    # Tiny bbox around the point for symmetry with bbox-based sources.
    bbox = {"n": lat + 0.125, "s": lat - 0.125, "w": lon - 0.125, "e": lon + 0.125}

    # Stamp three rows (one per variable) so a downstream consumer can
    # filter `WHERE variable='precip'` without reading the JSON notes.
    # All three describe the same fetch.
    prov_ids: list[int] = []
    for var in ("tmax", "tmin", "precip"):
        if var == "tmax" and "tmax_c" not in fetched.df.columns:
            continue
        if var == "tmin" and "tmin_c" not in fetched.df.columns:
            continue
        if var == "precip" and "precip_mm" not in fetched.df.columns:
            continue
        prov_ids.append(
            stamp_provenance(
                source=source,
                source_version=f"{year_start:04d}-{year_end:04d}",
                variable=var,
                date_start=date(year_start, 1, 1),
                date_end=date(year_end, 12, 31),
                area_bbox=bbox,
                license=license,
                citation=citation,
                storage_uri=daily_uri,
                bytes_=fetched.payload_bytes,
                checksum=None,
                notes=notes,
            )
        )

    return OpenMeteoChunkResult(
        parquet_local=parquet_local,
        daily_uri=daily_uri,
        rows_written=rows_written,
        provenance_id=prov_ids[0] if prov_ids else None,
        snapped_lat=fetched.snapped_lat,
        snapped_lon=fetched.snapped_lon,
    )

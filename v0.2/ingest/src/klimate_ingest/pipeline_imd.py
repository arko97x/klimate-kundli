"""End-to-end IMD pipeline for one (variable, year) chunk.

Mirrors `pipeline.process_chunk` for ERA5 but adapted to IMD's per-year,
already-daily .grd files:

  1. Upload raw .grd to R2 under `raw/imd/<variable>/<year>/<year>.grd`.
  2. Read the .grd via imdlib → xarray → tidy daily DataFrame.
  3. Write a daily Parquet locally; upload under `daily/<source>/...`.
  4. Upsert per-place daily_weather rows for cells mapped via place_grid_map.
  5. Stamp one source_provenance row covering the full year.

`source` here is the kundli source tag (`imd_rain` or `imd_temp`), which
is also the value `grid_cells.source` and `place_grid_map.source` carry.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .logging import get_logger
from .sources.imd_grid import IMD_AREA_BBOX, IMD_SOURCE_FOR
from .storage.r2 import R2Client
from .transform.imd_daily import imd_to_daily
from .transform.upsert import stamp_provenance, upsert_daily_weather

log = get_logger(__name__)


@dataclass(frozen=True)
class ImdChunkResult:
    raw_uri: str | None
    daily_uri: str | None
    parquet_local: Path
    rows_written: int
    provenance_id: int | None


def process_imd_year(
    *,
    cache_dir: Path,
    scratch_dir: Path,
    variable: str,
    year: int,
    grd_path: Path,
    bytes_: int,
    checksum: str,
    license: str,
    upload: bool = True,
    r2: R2Client | None = None,
    quality: int = 4,
) -> ImdChunkResult:
    """Upload, transform, upsert, and provenance-stamp one IMD year."""
    source = IMD_SOURCE_FOR[variable]
    scratch_dir.mkdir(parents=True, exist_ok=True)

    raw_uri: str | None = None
    if upload:
        r2 = r2 or R2Client.from_env()
        raw_key = f"raw/imd/{variable}/{year:04d}/{year:04d}.grd"
        raw_uri = r2.upload_file(grd_path, raw_key, content_type="application/octet-stream")

    log.info("pipeline.imd.transform.start", source=source, variable=variable, year=year)
    daily = imd_to_daily(cache_dir=cache_dir, variable=variable, year=year)

    parquet_local = scratch_dir / f"{source}_{variable}_{year:04d}.parquet"
    daily.df.to_parquet(parquet_local, index=False)
    log.info(
        "pipeline.imd.parquet.written",
        path=str(parquet_local),
        bytes=parquet_local.stat().st_size,
        rows=len(daily.df),
    )

    daily_uri: str | None = None
    if upload:
        assert r2 is not None
        daily_key = f"daily/{source}/{variable}/{year:04d}/{source}_{variable}_{year:04d}.parquet"
        daily_uri = r2.upload_file(parquet_local, daily_key, content_type="application/x-parquet")

    rows_written = upsert_daily_weather(
        df=daily.df,
        source=source,
        value_columns=daily.value_columns,
        source_version=str(year),
        quality=quality,
    )

    prov_id = stamp_provenance(
        source=source,
        source_version=str(year),
        variable=variable,
        date_start=date(year, 1, 1),
        date_end=date(year, 12, 31),
        area_bbox=IMD_AREA_BBOX,
        license=license,
        citation="India Meteorological Department, Pune (gridded daily product)",
        storage_uri=raw_uri,
        bytes_=bytes_,
        checksum=checksum,
    )

    return ImdChunkResult(
        raw_uri=raw_uri,
        daily_uri=daily_uri,
        parquet_local=parquet_local,
        rows_written=rows_written,
        provenance_id=prov_id,
    )

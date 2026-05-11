"""End-to-end phase-2 pipeline for one downloaded NetCDF chunk.

Given a local NetCDF (produced by `sources.cds_era5.fetch_chunk`), this:

  1. Uploads the raw file to R2 under `raw/{source}/{variable}/{year}/...`.
  2. Aggregates hourly → daily (°C and mm).
  3. Writes the daily DataFrame to a local Parquet and uploads to R2 under
     `daily/{source}/{variable}/{year}/...`.
  4. Upserts per-place rows into `daily_weather` for cells linked via
     `place_grid_map`.
  5. Stamps one `source_provenance` row for the chunk.

Returns a `ChunkResult` so callers (worker, transform CLI) can mark
`ingest_jobs` accordingly. R2 upload is optional via `upload=False` for
dry-run local-only flows.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .logging import get_logger
from .storage.r2 import R2Client
from .transform.daily import netcdf_to_daily
from .transform.upsert import stamp_provenance, upsert_daily_weather

log = get_logger(__name__)


@dataclass(frozen=True)
class ChunkResult:
    raw_uri: str | None           # s3://… or None when upload disabled
    daily_uri: str | None         # s3://… or None when upload disabled
    parquet_local: Path           # always written to scratch
    rows_written: int             # daily_weather upsert count
    provenance_id: int | None     # source_provenance row id


def process_chunk(
    *,
    nc_path: Path,
    source: str,
    variable: str,                 # short name: 'tavg' | 'tmax' | 'tmin' | 'precip'
    cds_variable: str,             # canonical: '2m_temperature' | 'total_precipitation'
    year: int,
    month: int,
    area_bbox: dict[str, float],
    scratch_dir: Path,
    bytes_: int,
    checksum: str,
    license: str | None = None,
    source_version: str | None = None,
    upload: bool = True,
    r2: R2Client | None = None,
) -> ChunkResult:
    nc_path = Path(nc_path)
    scratch_dir = Path(scratch_dir)
    scratch_dir.mkdir(parents=True, exist_ok=True)

    raw_uri: str | None = None
    if upload:
        r2 = r2 or R2Client.from_env()
        raw_key = (
            f"raw/{source}/{cds_variable}/{year:04d}/"
            f"{source}_{cds_variable}_{year:04d}-{month:02d}.nc"
        )
        raw_uri = r2.upload_file(nc_path, raw_key, content_type="application/x-netcdf")

    log.info("pipeline.transform.start", source=source, variable=variable, year=year, month=month)
    daily = netcdf_to_daily(nc_path, variable)

    parquet_local = scratch_dir / f"{source}_{variable}_{year:04d}-{month:02d}.parquet"
    daily.df.to_parquet(parquet_local, index=False)
    log.info(
        "pipeline.parquet.written",
        path=str(parquet_local),
        bytes=parquet_local.stat().st_size,
        rows=len(daily.df),
    )

    daily_uri: str | None = None
    if upload:
        assert r2 is not None
        daily_key = (
            f"daily/{source}/{variable}/{year:04d}/"
            f"{source}_{variable}_{year:04d}-{month:02d}.parquet"
        )
        daily_uri = r2.upload_file(parquet_local, daily_key, content_type="application/x-parquet")

    rows_written = upsert_daily_weather(
        df=daily.df,
        source=source,
        value_columns=daily.value_columns,
        source_version=source_version,
        quality=3,
    )

    last_day = calendar.monthrange(year, month)[1]
    prov_id = stamp_provenance(
        source=source,
        source_version=source_version,
        variable=cds_variable,
        date_start=date(year, month, 1),
        date_end=date(year, month, last_day),
        area_bbox=area_bbox,
        license=license,
        citation="ECMWF / Copernicus Climate Change Service (C3S), ERA5",
        storage_uri=raw_uri,
        bytes_=bytes_,
        checksum=checksum,
    )

    return ChunkResult(
        raw_uri=raw_uri,
        daily_uri=daily_uri,
        parquet_local=parquet_local,
        rows_written=rows_written,
        provenance_id=prov_id,
    )

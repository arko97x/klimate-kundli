"""Klimate ingest CLI.

Subcommands:
  places-load     Upsert places (and aliases) from CSV into Supabase.
  grid-build      Populate a grid for a source and map every place to it.
  grid-build-imd  Populate IMD's native grid (rain 0.25°, temp 1°) and map
                  Indian places to it.
  plan            Enqueue ingest_jobs for the pilot coverage window.
  status          Print job-queue counts.
  worker          Claim and run jobs (downloads, hashes, transforms, uploads).
  transform       Run phase-2 pipeline on a single local NetCDF (backfill).
  r2-init         Verify R2 credentials and create the archive bucket.
  requeue         Reset a finished/failed job back to pending.
  aggregate       Build aggregate serving tables.
  load-global     Phase 4.5 — load global indices, country emissions, and
                  country 2050 projections from curated CSVs (+ OWID fetch).
  imd-ingest      Phase 6 — pull IMD Pune gridded rainfall and temperature
                  for a year range, transform, and upsert daily_weather.
  grid-build-open-meteo
                  Phase 6c — register one grid_cells row per place at its
                  nominal lat/lon and map each place to its own cell for
                  source='open_meteo'.
  open-meteo-ingest
                  Phase 6c — pull Open-Meteo Historical (ERA5-derived) daily
                  archive per place for a year range and upsert daily_weather.
                  Use as the universal global floor below IMD and direct ERA5.
  ghcn-resolve    Phase 7 — pick the best GHCN-Daily station per place
                  (within max_distance_km, carrying TMAX/TMIN/PRCP for the
                  target window) and write grid_cells + place_grid_map.
  ghcn-ingest     Phase 7 — download .dly per resolved station, parse, and
                  upsert into daily_weather with source='ghcn'.
"""

from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path

import click

from . import config as cfg
from .aggregate import (
    build_all as build_all_aggregates,
    build_annual_extremes,
    build_annual_rain,
    build_decade_rain,
    build_monthly_normals,
    build_season_prefix,
    detect_baseline,
)
from .db import transaction
from .global_indices import (
    DATA_DIR_DEFAULT as GLOBAL_DATA_DIR_DEFAULT,
    MIN_YEAR_DEFAULT as GLOBAL_MIN_YEAR_DEFAULT,
    load_all as load_all_global,
)
from .logging import configure as configure_logging, get_logger
from .pipeline import process_chunk
from .pipeline_ghcn import process_ghcn_place, resolve_stations
from .pipeline_imd import process_imd_year
from .pipeline_open_meteo import process_open_meteo_place
from .places import read_csv, upsert as upsert_places
from .queue import jobs as q
from .sources.cds_era5 import CdsEra5Source
from .sources.ghcn_daily import GhcnDailySource
from .sources.imd_grid import IMD_GRID_SPECS, IMD_SOURCE_FOR, IMD_VARIABLES, ImdGridSource
from .sources.open_meteo import OPEN_METEO_MIN_YEAR, OpenMeteoSource
from .storage.r2 import R2Client
from .transform.place_map import (
    GridSpec,
    map_places_to_grid,
    populate_grid_at_places,
    populate_imd_grid,
    populate_open_meteo_cells,
)

log = get_logger(__name__)


# -- Hard-coded defaults for the first pilot pass. Edit in config.py rather --
# -- than here when the universe expands.                                    --

# India bbox (slightly inflated to give edge places clean grid neighbours).
INDIA_BBOX = {"n": 38.0, "s": 6.0, "w": 67.0, "e": 99.0}
# Global bbox (full world) for the global pilot cities.
GLOBAL_BBOX = {"n": 75.0, "s": -55.0, "w": -180.0, "e": 180.0}


@click.group(help="Klimate Kundli v0.2 ingest CLI.")
@click.option("--log-level", default=None, help="DEBUG | INFO | WARN | ERROR")
def main(log_level: str | None) -> None:
    if log_level:
        configure_logging(log_level)


# ---------------------------------------------------------------------------
# Places
# ---------------------------------------------------------------------------


@main.command("places-load", help="Load places + aliases from CSV into Supabase.")
@click.option(
    "--csv",
    "csv_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=cfg.PILOT_PLACES_CSV,
    show_default=True,
)
def places_load(csv_path: Path) -> None:
    rows = read_csv(csv_path)
    click.echo(f"read {len(rows)} places from {csv_path}")
    summary = upsert_places(rows)
    click.echo(json.dumps(summary, indent=2))


# ---------------------------------------------------------------------------
# Grid
# ---------------------------------------------------------------------------


@main.command("grid-build", help="Insert grid cells near every place and map each place to its nearest cell.")
@click.option("--source", required=True, type=click.Choice(["era5", "era5land"]))
@click.option(
    "--window",
    type=int,
    default=1,
    show_default=True,
    help="3x3 window per place when window=1; 5x5 when window=2; etc.",
)
def grid_build(source: str, window: int) -> None:
    resolution = 0.25 if source == "era5" else 0.1
    spec = GridSpec(source=source, resolution_deg=resolution, window=window)
    inserted = populate_grid_at_places(spec)
    mapped = map_places_to_grid(source, source_priority=cfg.SOURCE_PRIORITY[source])
    click.echo(json.dumps({"cells_inserted": inserted, "places_mapped": mapped}, indent=2))


@main.command(
    "grid-build-imd",
    help="Populate IMD's native grids (rain 0.25°, temp 1°) and map Indian places.",
)
@click.option(
    "--source",
    required=True,
    type=click.Choice(["imd_rain", "imd_temp", "both"]),
)
def grid_build_imd(source: str) -> None:
    targets = ["imd_rain", "imd_temp"] if source == "both" else [source]
    out: dict[str, dict[str, int]] = {}
    for s in targets:
        spec = IMD_GRID_SPECS[s]
        inserted = populate_imd_grid(
            source=s,
            resolution_deg=float(spec["resolution"]),
            lat0=float(spec["lat0"]),
            lat1=float(spec["lat1"]),
            lon0=float(spec["lon0"]),
            lon1=float(spec["lon1"]),
        )
        mapped = map_places_to_grid(
            s, source_priority=cfg.SOURCE_PRIORITY[s], country_filter="IN",
        )
        out[s] = {"cells_inserted": inserted, "places_mapped": mapped}
    click.echo(json.dumps(out, indent=2))


# ---------------------------------------------------------------------------
# Plan / Status
# ---------------------------------------------------------------------------


@main.command(help="Enqueue ingest_jobs for the pilot coverage window.")
@click.option("--source", required=True, type=click.Choice(["era5", "era5land"]))
@click.option("--region", default="global", type=click.Choice(["global", "india"]))
@click.option("--year-start", type=int, default=cfg.PILOT_YEAR_START, show_default=True)
@click.option("--year-end",   type=int, default=cfg.PILOT_YEAR_END,   show_default=True)
@click.option(
    "--variables",
    default="2m_temperature,total_precipitation",
    help="Comma-separated CDS variable names.",
)
def plan(source: str, region: str, year_start: int, year_end: int, variables: str) -> None:
    bbox = INDIA_BBOX if region == "india" else GLOBAL_BBOX
    vars_ = [v.strip() for v in variables.split(",") if v.strip()]
    enq = 0
    for v in vars_:
        for y in range(year_start, year_end + 1):
            for m in range(1, 13):
                q.enqueue(source=source, variable=v, year=y, area_bbox=bbox, month=m)
                enq += 1
    click.echo(json.dumps({"enqueued": enq, "variables": vars_, "years": [year_start, year_end]}, indent=2))


@main.command(help="Print ingest_jobs status counts.")
@click.option("--source", default=None)
def status(source: str | None) -> None:
    s = q.status_summary(source=source)
    click.echo(json.dumps(s, indent=2))


@main.command(help="Reset a job (or jobs) back to pending so the worker can re-run.")
@click.option("--id", "job_id", type=int, default=None, help="Single job id to requeue.")
@click.option("--status", "from_status", type=click.Choice(["done", "failed", "running"]), default=None,
              help="Requeue all jobs currently in this status.")
@click.option("--source", default=None, help="Filter --status by source.")
def requeue(job_id: int | None, from_status: str | None, source: str | None) -> None:
    if job_id is None and from_status is None:
        raise click.UsageError("pass --id or --status")
    with transaction() as conn, conn.cursor() as cur:
        if job_id is not None:
            cur.execute(
                """
                UPDATE ingest_jobs
                   SET status='pending', attempts=0, retry_at=NULL, lease_until=NULL,
                       worker_id=NULL, error=NULL
                 WHERE id = %s
                """,
                (job_id,),
            )
        else:
            cur.execute(
                """
                UPDATE ingest_jobs
                   SET status='pending', attempts=0, retry_at=NULL, lease_until=NULL,
                       worker_id=NULL, error=NULL
                 WHERE status = %s
                   AND (%s::text IS NULL OR source = %s::text)
                """,
                (from_status, source, source),
            )
        click.echo(json.dumps({"requeued": cur.rowcount}, indent=2))


# ---------------------------------------------------------------------------
# R2
# ---------------------------------------------------------------------------


@main.command("r2-init", help="Verify R2 credentials and create the archive bucket if missing.")
def r2_init() -> None:
    r2 = R2Client.from_env()
    created = r2.ensure_bucket()
    click.echo(json.dumps(
        {
            "bucket": r2.bucket,
            "endpoint": r2.cfg.endpoint,
            "status": "created" if created else "already_exists",
        },
        indent=2,
    ))


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------


@main.command(help="Claim and run jobs in a loop.")
@click.option("--source", required=True, type=click.Choice(["era5", "era5land"]))
@click.option("--max-jobs", type=int, default=None, help="Stop after this many jobs.")
@click.option(
    "--scratch",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path("./scratch"),
    show_default=True,
)
@click.option(
    "--idle-sleep",
    type=int,
    default=30,
    show_default=True,
    help="Seconds to sleep when no claimable job exists.",
)
@click.option("--no-upload", is_flag=True, help="Skip R2 upload (dev only).")
def worker(source: str, max_jobs: int | None, scratch: Path, idle_sleep: int, no_upload: bool) -> None:
    scratch.mkdir(parents=True, exist_ok=True)
    src = CdsEra5Source(name=source)
    r2 = None if no_upload else R2Client.from_env()
    if r2 is not None:
        r2.ensure_bucket()
    # Count every attempt (success or failure) against --max-jobs. Without
    # this, a stream of 403s would silently churn through every pending row.
    attempts = 0
    succeeded = 0
    failed = 0
    try:
        while max_jobs is None or attempts < max_jobs:
            job = q.claim_one(source=source)
            if job is None:
                if max_jobs is not None:
                    break
                log.info("worker.idle", sleep=idle_sleep)
                time.sleep(idle_sleep)
                continue
            attempts += 1
            log.info(
                "worker.claim",
                job_id=job.id,
                variable=job.variable,
                year=job.year,
                month=job.month,
            )
            try:
                with tempfile.TemporaryDirectory(prefix=f"job-{job.id}-", dir=scratch) as tmp:
                    short = _short_name_for(job.variable)
                    fetch = src.fetch_chunk(
                        variable=short,
                        year=job.year,
                        month=job.month,
                        area_bbox=job.area_bbox,
                        scratch_dir=Path(tmp),
                    )
                    result = process_chunk(
                        nc_path=Path(fetch.storage_uri),
                        source=job.source,
                        variable=short,
                        cds_variable=job.variable,
                        year=job.year,
                        month=job.month,
                        area_bbox=job.area_bbox,
                        scratch_dir=Path(tmp),
                        bytes_=fetch.bytes,
                        checksum=fetch.checksum,
                        license=src.license,
                        upload=(r2 is not None),
                        r2=r2,
                    )
                    q.mark_done(
                        job.id,
                        rows_written=result.rows_written,
                        bytes_=fetch.bytes,
                        checksum=fetch.checksum,
                        storage_uri=result.raw_uri or fetch.storage_uri,
                    )
                    succeeded += 1
                    log.info(
                        "worker.done",
                        job_id=job.id,
                        bytes=fetch.bytes,
                        raw_uri=result.raw_uri,
                        daily_uri=result.daily_uri,
                        rows_written=result.rows_written,
                    )
            except KeyboardInterrupt:
                log.warning("worker.interrupt", job_id=job.id)
                q.mark_failed(job.id, error="worker_interrupt", retry_in_seconds=0)
                raise
            except Exception as e:  # noqa: BLE001
                log.exception("worker.failed", job_id=job.id, error=str(e))
                q.mark_failed(job.id, error=str(e), retry_in_seconds=300)
                failed += 1
    except KeyboardInterrupt:
        log.warning("worker.exit", reason="keyboard_interrupt")
    click.echo(json.dumps({"attempts": attempts, "succeeded": succeeded, "failed": failed}))


def _short_name_for(cds_variable: str) -> str:
    if cds_variable == "2m_temperature":
        return "tavg"
    if cds_variable == "total_precipitation":
        return "precip"
    raise ValueError(f"unknown CDS variable: {cds_variable!r}")


# ---------------------------------------------------------------------------
# Transform (one-off backfill for a local NetCDF)
# ---------------------------------------------------------------------------


@main.command(help="Run phase-2 on a local NetCDF (raw upload + daily transform + upsert).")
@click.option("--source", required=True, type=click.Choice(["era5", "era5land"]))
@click.option("--cds-variable", required=True,
              type=click.Choice(["2m_temperature", "total_precipitation"]),
              help="Canonical CDS variable name in the file.")
@click.option("--year", required=True, type=int)
@click.option("--month", required=True, type=int)
@click.option("--file", "nc_file", required=True,
              type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--scratch", type=click.Path(file_okay=False, path_type=Path),
              default=Path("./scratch"), show_default=True)
@click.option("--no-upload", is_flag=True, help="Skip R2 upload.")
def transform(
    source: str,
    cds_variable: str,
    year: int,
    month: int,
    nc_file: Path,
    scratch: Path,
    no_upload: bool,
) -> None:
    short = _short_name_for(cds_variable)
    bbox = _bbox_for(source, cds_variable, year, month)
    if bbox is None:
        raise click.UsageError(
            "no matching ingest_jobs row found for area_bbox; run `plan` first or pass via env."
        )

    fetch_bytes = nc_file.stat().st_size
    checksum = _sha256_file(nc_file)

    scratch.mkdir(parents=True, exist_ok=True)
    r2 = None if no_upload else R2Client.from_env()
    if r2 is not None:
        r2.ensure_bucket()
    result = process_chunk(
        nc_path=nc_file,
        source=source,
        variable=short,
        cds_variable=cds_variable,
        year=year,
        month=month,
        area_bbox=bbox,
        scratch_dir=scratch,
        bytes_=fetch_bytes,
        checksum=checksum,
        license=CdsEra5Source(name=source).license,
        upload=(r2 is not None),
        r2=r2,
    )
    click.echo(json.dumps(
        {
            "raw_uri": result.raw_uri,
            "daily_uri": result.daily_uri,
            "parquet_local": str(result.parquet_local),
            "rows_written": result.rows_written,
            "provenance_id": result.provenance_id,
            "checksum": checksum,
            "bytes": fetch_bytes,
        },
        indent=2,
    ))


def _bbox_for(source: str, cds_variable: str, year: int, month: int) -> dict[str, float] | None:
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT area_bbox FROM ingest_jobs
             WHERE source=%s AND variable=%s AND year=%s AND month=%s
             LIMIT 1
            """,
            (source, cds_variable, year, month),
        )
        row = cur.fetchone()
        return row["area_bbox"] if row else None


def _sha256_file(path: Path, chunk: int = 1024 * 1024) -> str:
    import hashlib

    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Aggregate
# ---------------------------------------------------------------------------


_AGG_CHOICES = ("all", "annual_extremes", "annual_rain", "decade_rain",
                "monthly_normals", "season_prefix")


@main.command(help="Roll daily_weather into aggregate serving tables.")
@click.option("--source", default="era5", show_default=True,
              help="Build aggregates for this single source per pass.")
@click.option("--what", type=click.Choice(_AGG_CHOICES), default="all", show_default=True)
@click.option("--baseline-start", type=int, default=None,
              help="WMO baseline year start (monthly_normals only).")
@click.option("--baseline-end", type=int, default=None,
              help="WMO baseline year end (monthly_normals only).")
@click.option("--quality", type=int, default=3, show_default=True,
              help="Aggregate quality stamp (1=worst, 5=best).")
def aggregate(
    source: str,
    what: str,
    baseline_start: int | None,
    baseline_end: int | None,
    quality: int,
) -> None:
    if what == "all":
        result = build_all_aggregates(
            source=source,
            baseline_start=baseline_start,
            baseline_end=baseline_end,
            quality=quality,
        )
        click.echo(json.dumps(result.as_dict(), indent=2))
        return

    if what == "annual_extremes":
        n = build_annual_extremes(source=source, quality=quality)
    elif what == "annual_rain":
        n = build_annual_rain(source=source, quality=quality)
    elif what == "decade_rain":
        n = build_decade_rain(source=source, quality=quality)
    elif what == "season_prefix":
        n = build_season_prefix(source=source)
    elif what == "monthly_normals":
        if baseline_start is None or baseline_end is None:
            b_start, b_end = detect_baseline(source=source)
            if b_start == -1:
                raise click.UsageError(f"no daily_weather rows for source={source!r}")
            baseline_start = baseline_start or b_start
            baseline_end = baseline_end or b_end
        n = build_monthly_normals(
            source=source,
            baseline_start=baseline_start,
            baseline_end=baseline_end,
            quality=quality,
        )
    else:  # pragma: no cover - click already validated
        raise click.UsageError(f"unknown --what: {what!r}")
    click.echo(json.dumps(
        {
            "what": what,
            "source": source,
            "rows": n,
            "baseline_start": baseline_start,
            "baseline_end": baseline_end,
        },
        indent=2,
    ))


# ---------------------------------------------------------------------------
# IMD ingest (phase 6)
# ---------------------------------------------------------------------------


@main.command(
    "imd-ingest",
    help="Pull IMD Pune gridded data for a variable+year range, transform, and upsert.",
)
@click.option(
    "--variable",
    required=True,
    type=click.Choice(list(IMD_VARIABLES) + ["all"]),
    help="rain | tmax | tmin | all (loops over all three).",
)
@click.option("--year-start", required=True, type=int)
@click.option("--year-end",   required=True, type=int)
@click.option(
    "--cache-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path("./scratch/imd"),
    show_default=True,
    help="Persistent .grd cache; re-runs skip already-downloaded files.",
)
@click.option(
    "--scratch",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path("./scratch"),
    show_default=True,
)
@click.option("--no-upload", is_flag=True, help="Skip R2 upload (dev / no creds).")
@click.option("--quality", type=int, default=4, show_default=True,
              help="quality stamp (IMD = 4: gridded, observation-derived).")
def imd_ingest(
    variable: str,
    year_start: int,
    year_end: int,
    cache_dir: Path,
    scratch: Path,
    no_upload: bool,
    quality: int,
) -> None:
    if year_end < year_start:
        raise click.UsageError("--year-end must be >= --year-start")
    vars_ = list(IMD_VARIABLES) if variable == "all" else [variable]
    src = ImdGridSource()
    r2 = None if no_upload else R2Client.from_env()
    if r2 is not None:
        r2.ensure_bucket()

    cache_dir.mkdir(parents=True, exist_ok=True)
    scratch.mkdir(parents=True, exist_ok=True)

    totals: dict[str, dict[str, int]] = {v: {"years": 0, "rows": 0, "failed": 0} for v in vars_}
    for v in vars_:
        for y in range(year_start, year_end + 1):
            log.info("imd.year.start", variable=v, year=y)
            try:
                fetch = src.fetch_year(variable=v, year=y, cache_dir=cache_dir)
                result = process_imd_year(
                    cache_dir=cache_dir,
                    scratch_dir=scratch,
                    variable=v,
                    year=y,
                    grd_path=Path(fetch.storage_uri),
                    bytes_=fetch.bytes,
                    checksum=fetch.checksum,
                    license=src.license,
                    upload=(r2 is not None),
                    r2=r2,
                    quality=quality,
                )
                totals[v]["years"] += 1
                totals[v]["rows"] += result.rows_written
                log.info(
                    "imd.year.done",
                    variable=v,
                    year=y,
                    rows_written=result.rows_written,
                    raw_uri=result.raw_uri,
                )
            except Exception as e:  # noqa: BLE001
                log.exception("imd.year.failed", variable=v, year=y, error=str(e))
                totals[v]["failed"] += 1

    summary = {
        "variables": vars_,
        "year_start": year_start,
        "year_end": year_end,
        "totals": totals,
        "source_for": {v: IMD_SOURCE_FOR[v] for v in vars_},
    }
    click.echo(json.dumps(summary, indent=2))


# ---------------------------------------------------------------------------
# Global indices (phase 4.5)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Open-Meteo (phase 6c) — global per-place daily archive
# ---------------------------------------------------------------------------


@main.command(
    "grid-build-open-meteo",
    help="Register one grid_cells row per place for source='open_meteo' "
         "and map each place to its own cell.",
)
def grid_build_open_meteo() -> None:
    inserted = populate_open_meteo_cells(
        source="open_meteo", resolution_deg=0.25,
    )
    mapped = map_places_to_grid(
        "open_meteo", source_priority=cfg.SOURCE_PRIORITY["open_meteo"],
    )
    click.echo(json.dumps({"cells_inserted": inserted, "places_mapped": mapped}, indent=2))


@main.command(
    "open-meteo-ingest",
    help="Pull Open-Meteo historical daily archive (ERA5-derived) per place "
         "for a year range and upsert daily_weather.",
)
@click.option("--year-start", type=int, default=OPEN_METEO_MIN_YEAR, show_default=True)
@click.option("--year-end",   type=int, default=None,
              help="Defaults to last full year (today's year - 1).")
@click.option(
    "--countries",
    default=None,
    help="Comma-separated ISO alpha-2 codes; if omitted all places are pulled. "
         "Useful for staged rollouts (e.g. --countries=IN to refresh India first).",
)
@click.option(
    "--slugs",
    default=None,
    help="Comma-separated place slugs; if set, --countries is ignored.",
)
@click.option(
    "--scratch",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path("./scratch"),
    show_default=True,
)
@click.option("--no-upload", is_flag=True, help="Skip R2 upload (dev / no creds).")
@click.option("--quality", type=int, default=3, show_default=True,
              help="Quality stamp (3 = reanalysis-derived).")
@click.option(
    "--sleep-ms",
    type=int,
    default=2000,
    show_default=True,
    help="Politeness sleep between PLACE fetches. Open-Meteo throttles on "
         "computational cost per request, so we slow the loop accordingly.",
)
@click.option(
    "--chunk-years",
    type=int,
    default=10,
    show_default=True,
    help="Split each place's date range into chunks of this many years. "
         "Smaller chunks are friendlier to Open-Meteo's per-IP throttle.",
)
@click.option(
    "--chunk-sleep-ms",
    type=int,
    default=400,
    show_default=True,
    help="Politeness sleep between CHUNKS within one place.",
)
def open_meteo_ingest(
    year_start: int,
    year_end: int | None,
    countries: str | None,
    slugs: str | None,
    scratch: Path,
    no_upload: bool,
    quality: int,
    sleep_ms: int,
    chunk_years: int,
    chunk_sleep_ms: int,
) -> None:
    if year_start < OPEN_METEO_MIN_YEAR:
        raise click.UsageError(
            f"Open-Meteo archive starts {OPEN_METEO_MIN_YEAR}"
        )
    if year_end is None:
        # Last full year by default; today's year often has incomplete data.
        from datetime import date as _date
        year_end = _date.today().year - 1
    if year_end < year_start:
        raise click.UsageError("--year-end must be >= --year-start")

    scratch.mkdir(parents=True, exist_ok=True)
    r2 = None if no_upload else R2Client.from_env()
    if r2 is not None:
        r2.ensure_bucket()

    src = OpenMeteoSource()

    # Resolve target place set from --slugs > --countries > all.
    with transaction() as conn, conn.cursor() as cur:
        if slugs:
            wanted = [s.strip() for s in slugs.split(",") if s.strip()]
            cur.execute(
                "SELECT slug, name, country_code, lat, lon FROM places "
                "WHERE slug = ANY(%s) ORDER BY slug",
                (wanted,),
            )
        elif countries:
            ccs = [c.strip().upper() for c in countries.split(",") if c.strip()]
            cur.execute(
                "SELECT slug, name, country_code, lat, lon FROM places "
                "WHERE country_code = ANY(%s) ORDER BY country_code, slug",
                (ccs,),
            )
        else:
            cur.execute(
                "SELECT slug, name, country_code, lat, lon FROM places "
                "ORDER BY country_code, slug"
            )
        places = cur.fetchall()

    if not places:
        click.echo(json.dumps({"error": "no places matched filter"}, indent=2))
        return

    log.info(
        "open_meteo.ingest.start",
        places=len(places),
        year_start=year_start,
        year_end=year_end,
        upload=(r2 is not None),
    )

    totals = {"places": 0, "rows": 0, "failed": 0}
    failures: list[dict[str, str]] = []
    for p in places:
        slug = str(p["slug"])
        try:
            log.info(
                "open_meteo.place.start",
                slug=slug, lat=float(p["lat"]), lon=float(p["lon"]),
            )
            result = process_open_meteo_place(
                slug=slug,
                lat=float(p["lat"]),
                lon=float(p["lon"]),
                year_start=year_start,
                year_end=year_end,
                scratch_dir=scratch,
                license=src.license,
                citation=src.citation,
                upload=(r2 is not None),
                r2=r2,
                quality=quality,
                chunk_years=chunk_years,
                inter_chunk_sleep_ms=chunk_sleep_ms,
            )
            totals["places"] += 1
            totals["rows"]   += result.rows_written
            log.info(
                "open_meteo.place.done",
                slug=slug,
                rows=result.rows_written,
                daily_uri=result.daily_uri,
                snapped=(result.snapped_lat, result.snapped_lon),
            )
        except Exception as e:  # noqa: BLE001
            log.exception("open_meteo.place.failed", slug=slug, error=str(e))
            totals["failed"] += 1
            failures.append({"slug": slug, "error": str(e)})
        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000.0)

    summary = {
        "year_start": year_start,
        "year_end": year_end,
        "totals": totals,
        "failures": failures,
    }
    click.echo(json.dumps(summary, indent=2))


# ---------------------------------------------------------------------------
# GHCN-Daily (phase 7) — global station observations
# ---------------------------------------------------------------------------


@main.command(
    "ghcn-resolve",
    help="Pick the best GHCN-Daily station per place and write grid_cells + place_grid_map.",
)
@click.option(
    "--cache-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path("./scratch/ghcn"),
    show_default=True,
    help="Persistent cache for ghcnd-stations.txt / ghcnd-inventory.txt.",
)
@click.option("--max-distance-km", type=float, default=50.0, show_default=True)
@click.option("--target-year-min",  type=int,   default=2010, show_default=True,
              help="Stations must have data at least up to this year.")
@click.option("--history-year-min", type=int,   default=1990, show_default=True,
              help="Stations must have data starting at or before this year.")
@click.option("--refresh-catalog",  is_flag=True,
              help="Force re-download of stations + inventory.")
def ghcn_resolve(
    cache_dir: Path,
    max_distance_km: float,
    target_year_min: int,
    history_year_min: int,
    refresh_catalog: bool,
) -> None:
    picks = resolve_stations(
        cache_dir=cache_dir,
        max_distance_km=max_distance_km,
        target_year_min=target_year_min,
        history_year_min=history_year_min,
        refresh_catalog=refresh_catalog,
    )
    out = [
        {
            "place_slug":   p.place_slug,
            "station_id":   p.station_id,
            "station_name": p.station_name,
            "distance_km":  round(p.distance_km, 2),
            "tmax_years":   [p.tmax_y_start, p.tmax_y_end],
            "elev_m":       p.elev_m,
        }
        for p in picks
    ]
    click.echo(json.dumps({"picks": out, "count": len(out)}, indent=2))


@main.command(
    "ghcn-ingest",
    help="Download .dly per resolved station and upsert daily_weather.",
)
@click.option(
    "--cache-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path("./scratch/ghcn"),
    show_default=True,
)
@click.option(
    "--scratch",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path("./scratch"),
    show_default=True,
)
@click.option("--no-upload", is_flag=True, help="Skip R2 upload (dev / no creds).")
@click.option(
    "--slugs",
    default=None,
    help="Comma-separated place slugs; if set, only ingest these.",
)
@click.option("--quality", type=int, default=5, show_default=True,
              help="quality stamp (5 = station observations).")
@click.option(
    "--sleep-ms",
    type=int,
    default=300,
    show_default=True,
    help="Politeness sleep between station fetches.",
)
def ghcn_ingest(
    cache_dir: Path,
    scratch: Path,
    no_upload: bool,
    slugs: str | None,
    quality: int,
    sleep_ms: int,
) -> None:
    src = GhcnDailySource()
    r2 = None if no_upload else R2Client.from_env()
    if r2 is not None:
        r2.ensure_bucket()

    # Re-read picks from place_grid_map (so this command can run any time
    # after `ghcn-resolve`, even in a new shell).
    wanted_slugs = {s.strip() for s in slugs.split(",")} if slugs else None
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.id AS place_id, p.slug, p.name, p.lat AS place_lat, p.lon AS place_lon,
                   g.lat AS station_lat, g.lon AS station_lon,
                   m.distance_m
              FROM place_grid_map m
              JOIN places p     ON p.id = m.place_id
              JOIN grid_cells g ON g.id = m.grid_cell_id
             WHERE m.source = 'ghcn'
             ORDER BY p.slug
            """
        )
        rows = cur.fetchall()

    if not rows:
        click.echo(json.dumps({"error": "no GHCN picks; run ghcn-resolve first"}, indent=2))
        return

    # We need the station_id per place: look it up from the cached
    # inventory + nearest-by-coords. Cheaper: stash station_id in
    # source_provenance during ingest. For now derive by reverse lookup
    # against stations.txt — one extra parse but the file is local.
    from .transform.ghcn_daily import parse_stations
    stations_path = cache_dir / "ghcnd-stations.txt"
    if not stations_path.exists():
        # No catalog cached — fetch it now.
        src.fetch_catalog(cache_dir)
    stations_df = parse_stations(stations_path)
    stations_by_coord = {
        (round(float(r["lat"]), 6), round(float(r["lon"]), 6)): str(r["station_id"])
        for _, r in stations_df.iterrows()
    }

    totals = {"places": 0, "rows": 0, "missing_station": 0, "failed": 0}
    for r in rows:
        slug = str(r["slug"])
        if wanted_slugs and slug not in wanted_slugs:
            continue
        key = (round(float(r["station_lat"]), 6), round(float(r["station_lon"]), 6))
        station_id = stations_by_coord.get(key)
        if not station_id:
            totals["missing_station"] += 1
            log.warning("ghcn.ingest.unmapped_station", slug=slug, key=key)
            continue
        pick = type("P", (), {})()  # tiny ad-hoc shim
        # Build StationPick from DB row + stations_df.
        srow = stations_df[stations_df["station_id"] == station_id].iloc[0]
        from .pipeline_ghcn import StationPick
        pick = StationPick(
            place_id=int(r["place_id"]),
            place_slug=slug,
            place_lat=float(r["place_lat"]),
            place_lon=float(r["place_lon"]),
            station_id=station_id,
            station_lat=float(srow["lat"]),
            station_lon=float(srow["lon"]),
            station_name=str(srow["name"]),
            distance_km=float(r["distance_m"]) / 1000.0,
            elev_m=(None if srow["elev_m"] is None or _is_nan(srow["elev_m"]) else float(srow["elev_m"])),
            tmax_y_start=0,
            tmax_y_end=0,
        )
        try:
            log.info("ghcn.place.start", slug=slug, station_id=station_id)
            result = process_ghcn_place(
                pick=pick,
                cache_dir=cache_dir,
                scratch_dir=scratch,
                license=src.license,
                citation=src.citation,
                upload=(r2 is not None),
                r2=r2,
                quality=quality,
            )
            totals["places"] += 1
            totals["rows"]   += result.rows_written
            log.info(
                "ghcn.place.done",
                slug=slug, station_id=station_id, rows=result.rows_written,
                daily_uri=result.daily_uri,
            )
        except FileNotFoundError as e:
            totals["missing_station"] += 1
            log.warning("ghcn.place.missing", slug=slug, error=str(e))
        except Exception as e:  # noqa: BLE001
            log.exception("ghcn.place.failed", slug=slug, error=str(e))
            totals["failed"] += 1
        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000.0)

    click.echo(json.dumps({"totals": totals}, indent=2))


def _is_nan(v: object) -> bool:
    try:
        return v != v  # type: ignore[comparison-overlap]
    except Exception:  # noqa: BLE001
        return False


# ---------------------------------------------------------------------------
# Global indices (phase 4.5)
# ---------------------------------------------------------------------------


@main.command("load-global",
              help="Load global indices (CO2 ppm, sea level, country emissions, 2050 projections).")
@click.option(
    "--data-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=GLOBAL_DATA_DIR_DEFAULT,
    show_default=True,
    help="Directory holding the curated CSVs (defaults to v0.2/data/global/).",
)
@click.option("--refresh-owid", is_flag=True,
              help="Force re-download of the OWID CO2 master CSV (otherwise reuses .cache).")
@click.option("--min-year", type=int, default=GLOBAL_MIN_YEAR_DEFAULT,
              show_default=True, help="Drop OWID rows older than this (kundli visitors are 1940+).")
def load_global(data_dir: Path, refresh_owid: bool, min_year: int) -> None:
    summary = load_all_global(
        data_dir=data_dir, refresh_owid=refresh_owid, min_year=min_year,
    )
    click.echo(json.dumps(summary.as_dict(), indent=2))


if __name__ == "__main__":
    main()

"""Klimate ingest CLI.

Subcommands:
  places-load     Upsert places (and aliases) from CSV into Supabase.
  grid-build      Populate a grid for a source and map every place to it.
  plan            Enqueue ingest_jobs for the pilot coverage window.
  status          Print job-queue counts.
  worker          Claim and run jobs (downloads, hashes, transforms, uploads).
  transform       Run phase-2 pipeline on a single local NetCDF (backfill).
  r2-init         Verify R2 credentials and create the archive bucket.
  requeue         Reset a finished/failed job back to pending.
  aggregate       Build aggregate serving tables (skeleton).
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
from .logging import configure as configure_logging, get_logger
from .pipeline import process_chunk
from .places import read_csv, upsert as upsert_places
from .queue import jobs as q
from .sources.cds_era5 import CdsEra5Source
from .storage.r2 import R2Client
from .transform.place_map import GridSpec, map_places_to_grid, populate_grid_at_places

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


if __name__ == "__main__":
    main()

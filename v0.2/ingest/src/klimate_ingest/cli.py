"""Klimate ingest CLI.

Subcommands:
  places-load     Upsert places (and aliases) from CSV into Supabase.
  grid-build      Populate a grid for a source and map every place to it.
  plan            Enqueue ingest_jobs for the pilot coverage window.
  status          Print job-queue counts.
  worker          Claim and run jobs (downloads, hashes, marks done).
  aggregate       Build aggregate serving tables (skeleton).
"""

from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path

import click

from . import config as cfg
from .logging import configure as configure_logging, get_logger
from .places import read_csv, upsert as upsert_places
from .queue import jobs as q
from .sources.cds_era5 import CdsEra5Source
from .transform.place_map import GridSpec, map_places_to_grid, populate_grid

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


@main.command("grid-build", help="Populate a grid for a source and map places to it.")
@click.option("--source", required=True, type=click.Choice(["era5", "era5land"]))
@click.option("--region", default="global", type=click.Choice(["global", "india"]))
def grid_build(source: str, region: str) -> None:
    resolution = 0.25 if source == "era5" else 0.1
    bbox = INDIA_BBOX if region == "india" else GLOBAL_BBOX
    spec = GridSpec(
        source=source,
        resolution_deg=resolution,
        lat_min=bbox["s"],
        lat_max=bbox["n"],
        lon_min=bbox["w"],
        lon_max=bbox["e"],
    )
    inserted = populate_grid(spec)
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
def worker(source: str, max_jobs: int | None, scratch: Path, idle_sleep: int) -> None:
    scratch.mkdir(parents=True, exist_ok=True)
    src = CdsEra5Source(name=source)
    done = 0
    while max_jobs is None or done < max_jobs:
        job = q.claim_one(source=source)
        if job is None:
            log.info("worker.idle", sleep=idle_sleep)
            time.sleep(idle_sleep)
            continue
        log.info("worker.claim", job_id=job.id, variable=job.variable, year=job.year, month=job.month)
        try:
            with tempfile.TemporaryDirectory(prefix=f"job-{job.id}-", dir=scratch) as tmp:
                # The worker maps job.variable (CDS name) → our short name for
                # the source connector. Both are wired through CDS_VARIABLE_NAMES.
                short = _short_name_for(job.variable)
                result = src.fetch_chunk(
                    variable=short,
                    year=job.year,
                    month=job.month,
                    area_bbox=job.area_bbox,
                    scratch_dir=Path(tmp),
                )
                # Upload to R2 / write daily Parquet / etc. — wired in pass 2.
                q.mark_done(
                    job.id,
                    bytes_=result.bytes,
                    checksum=result.checksum,
                    storage_uri=result.storage_uri,
                )
                done += 1
                log.info("worker.done", job_id=job.id, bytes=result.bytes)
        except Exception as e:  # noqa: BLE001
            log.exception("worker.failed", job_id=job.id, error=str(e))
            q.mark_failed(job.id, error=str(e), retry_in_seconds=300)
    click.echo(json.dumps({"completed": done}))


def _short_name_for(cds_variable: str) -> str:
    if cds_variable == "2m_temperature":
        return "tavg"
    if cds_variable == "total_precipitation":
        return "precip"
    raise ValueError(f"unknown CDS variable: {cds_variable!r}")


# ---------------------------------------------------------------------------
# Aggregate
# ---------------------------------------------------------------------------


@main.command(help="Build aggregate serving tables (skeleton).")
@click.option("--target", default="supabase")
def aggregate(target: str) -> None:
    click.echo(f"aggregate: target={target} — not implemented yet (skeleton).")


if __name__ == "__main__":
    main()

"""Upsert daily aggregates into Supabase and stamp provenance.

The serving DB stores per-place daily rows (`daily_weather`) and a
ledger of fetch events (`source_provenance`). Both are populated here
after the hourly→daily transform.

Mapping cells → places:

Each (source, lat, lon) grid cell is linked to N places via
`place_grid_map` (filled by `transform.place_map`). We pull the join
once per call and broadcast each cell's daily values across the places
that point at it. Only cells that show up in `place_grid_map` are kept;
the rest of the Parquet (used for archival) is dropped here.

Multi-variable rows:

`daily_weather` carries tmax_c, tmin_c, precip_mm. Each ingest chunk
covers one CDS variable, so it only writes the subset of columns it
knows about. We use `COALESCE(EXCLUDED.col, daily_weather.col)` so a
later precip ingest does not nuke a previously-written temperature row
(and vice versa).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import date
from typing import Any

import pandas as pd
import psycopg

from ..db import transaction
from ..logging import get_logger

log = get_logger(__name__)


_DAILY_COLS = ("tmax_c", "tmin_c", "precip_mm")


def upsert_daily_weather(
    *,
    df: pd.DataFrame,
    source: str,
    value_columns: Sequence[str],
    source_version: str | None = None,
    quality: int = 3,
    batch_size: int = 5000,
) -> int:
    """Write daily rows into `daily_weather` for places mapped on `source`.

    Returns the number of (place, date) rows touched (insert + update).
    """
    if df.empty:
        return 0

    target_cols = [c for c in value_columns if c in _DAILY_COLS]
    if not target_cols:
        log.info("upsert.skip", reason="no_target_columns", value_columns=list(value_columns))
        return 0

    with transaction() as conn:
        lookup = _grid_lookup(source, conn)
        if not lookup:
            log.warning("upsert.no_grid", source=source)
            return 0

        merged = _attach_place_ids(df, lookup, target_cols)
        if merged.empty:
            log.info("upsert.no_matches", source=source, rows_in=len(df))
            return 0

        rows = _to_param_rows(merged, target_cols, source, source_version, quality)
        n = _execute_upsert(conn, rows, batch_size=batch_size)
    log.info("upsert.daily_weather", source=source, rows_written=n, cols=target_cols)
    return n


def stamp_provenance(
    *,
    source: str,
    source_version: str | None,
    variable: str,
    date_start: date,
    date_end: date,
    area_bbox: dict[str, float],
    license: str | None,
    citation: str | None,
    storage_uri: str | None,
    bytes_: int | None,
    checksum: str | None,
    notes: str | None = None,
) -> int:
    """Insert one row into `source_provenance`. Returns the new id."""
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO source_provenance (
              source, source_version, variable, date_start, date_end,
              area_bbox, license, citation, storage_uri, bytes, checksum, notes
            ) VALUES (
              %s, %s, %s, %s, %s,
              %s::jsonb, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
            """,
            (
                source,
                source_version,
                variable,
                date_start,
                date_end,
                json.dumps(area_bbox),
                license,
                citation,
                storage_uri,
                bytes_,
                checksum,
                notes,
            ),
        )
        row_id = int(cur.fetchone()["id"])  # type: ignore[index]
    log.info(
        "provenance.stamped",
        id=row_id,
        source=source,
        variable=variable,
        date_start=str(date_start),
        date_end=str(date_end),
    )
    return row_id


# ---------------------------------------------------------------------------
# internals
# ---------------------------------------------------------------------------


def _grid_lookup(
    source: str,
    conn: psycopg.Connection[dict[str, Any]],
) -> dict[tuple[float, float], list[int]]:
    """{(lat, lon): [place_id, ...]} for this source. Both are rounded to 6dp."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT g.lat, g.lon, m.place_id
              FROM grid_cells g
              JOIN place_grid_map m ON m.grid_cell_id = g.id
             WHERE g.source = %s AND m.source = %s
            """,
            (source, source),
        )
        out: dict[tuple[float, float], list[int]] = {}
        for r in cur.fetchall():
            key = (round(float(r["lat"]), 6), round(float(r["lon"]), 6))
            out.setdefault(key, []).append(int(r["place_id"]))
    return out


def _attach_place_ids(
    df: pd.DataFrame,
    lookup: dict[tuple[float, float], list[int]],
    target_cols: list[str],
) -> pd.DataFrame:
    """Filter df to mapped cells and expand each cell to its mapped places."""
    cells = pd.DataFrame(
        (
            {"lat": la, "lon": lo, "place_id": pid}
            for (la, lo), pids in lookup.items()
            for pid in pids
        ),
        columns=["lat", "lon", "place_id"],
    )
    keep = ["date", "lat", "lon", *target_cols]
    sub = df[keep].copy()
    sub["lat"] = sub["lat"].astype(float).round(6)
    sub["lon"] = sub["lon"].astype(float).round(6)
    merged = sub.merge(cells, on=["lat", "lon"], how="inner")
    return merged


def _to_param_rows(
    df: pd.DataFrame,
    target_cols: list[str],
    source: str,
    source_version: str | None,
    quality: int,
) -> list[tuple[Any, ...]]:
    """Build positional rows: (place_id, date, tmax_c, tmin_c, precip_mm, src, ver, q)."""
    # Fill missing target columns with None so the SQL signature stays fixed.
    for col in _DAILY_COLS:
        if col not in df.columns:
            df = df.assign(**{col: None})
    rows: list[tuple[Any, ...]] = []
    for r in df.itertuples(index=False):
        tmax = getattr(r, "tmax_c", None)
        tmin = getattr(r, "tmin_c", None)
        prec = getattr(r, "precip_mm", None)
        rows.append(
            (
                int(r.place_id),
                r.date,
                _nan_to_none(tmax) if "tmax_c" in target_cols else None,
                _nan_to_none(tmin) if "tmin_c" in target_cols else None,
                _nan_to_none(prec) if "precip_mm" in target_cols else None,
                source,
                source_version,
                quality,
            )
        )
    return rows


def _nan_to_none(v: Any) -> Any:
    if v is None:
        return None
    try:
        # pandas/xarray emit NaN for missing; Postgres wants NULL.
        if v != v:  # NaN check without importing math
            return None
    except Exception:  # noqa: BLE001
        return v
    return float(v)


_UPSERT_SQL = """
INSERT INTO daily_weather
  (place_id, date, tmax_c, tmin_c, precip_mm, source, source_version, quality)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (place_id, date) DO UPDATE SET
  tmax_c         = COALESCE(EXCLUDED.tmax_c,         daily_weather.tmax_c),
  tmin_c         = COALESCE(EXCLUDED.tmin_c,         daily_weather.tmin_c),
  precip_mm      = COALESCE(EXCLUDED.precip_mm,      daily_weather.precip_mm),
  source         = EXCLUDED.source,
  source_version = EXCLUDED.source_version,
  quality        = EXCLUDED.quality
"""


def _execute_upsert(
    conn: psycopg.Connection[dict[str, Any]],
    rows: list[tuple[Any, ...]],
    *,
    batch_size: int,
) -> int:
    n = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), batch_size):
            chunk = rows[i : i + batch_size]
            cur.executemany(_UPSERT_SQL, chunk)
            n += len(chunk)
    return n

"""Map each place in `places` to its nearest grid cell per source.

Workflow:

1. Read every place from the `places` table.
2. For each place, analytically snap to the source's native grid resolution
   (e.g. 0.25° for ERA5, 0.1° for ERA5-Land) and insert a 3×3 window of
   `grid_cells` rows around it. The window protects against edge cases at
   irregular boundaries and gives PostGIS multiple candidates for the
   nearest-neighbour search.
3. After cells are inserted, the second pass links each place to its
   nearest cell via PostGIS `<->` and stores the great-circle distance.

This is a one-shot maintenance job: re-run after the place gazetteer
expands or after adding a new source. Cell rows dedup via the UNIQUE
(source, lat, lon) constraint, so re-runs are idempotent.

Note: this is intentionally **place-sparse**. Filling the entire globe at
ERA5-Land's 0.1° grid would be ~13M rows; we only need cells near the
places we actually serve.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..db import transaction
from ..logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class GridSpec:
    source: str
    resolution_deg: float
    window: int = 1  # number of cells either side; 1 => 3x3 around each place


def _snap(value: float, resolution: float) -> float:
    """Round to the nearest cell-centre at `resolution` degrees."""
    return round(round(value / resolution) * resolution, 6)


def populate_grid_at_places(spec: GridSpec) -> int:
    """Insert cells near every place. Returns number of new rows."""
    res = spec.resolution_deg
    w = spec.window
    inserted = 0
    with transaction() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, lat, lon FROM places")
        places = cur.fetchall()
        seen: set[tuple[float, float]] = set()
        for p in places:
            la0 = _snap(float(p["lat"]), res)
            lo0 = _snap(float(p["lon"]), res)
            for di in range(-w, w + 1):
                for dj in range(-w, w + 1):
                    la = round(la0 + di * res, 6)
                    lo = round(lo0 + dj * res, 6)
                    # clip to valid earth coords
                    if not (-90.0 <= la <= 90.0):
                        continue
                    if lo < -180.0:
                        lo += 360.0
                    elif lo > 180.0:
                        lo -= 360.0
                    if (la, lo) in seen:
                        continue
                    seen.add((la, lo))
                    cur.execute(
                        """
                        INSERT INTO grid_cells (source, resolution_deg, lat, lon)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (source, lat, lon) DO NOTHING
                        """,
                        (spec.source, res, la, lo),
                    )
                    if cur.rowcount:
                        inserted += 1
    log.info(
        "grid.populate.done",
        source=spec.source,
        resolution=res,
        candidates=len(seen),
        inserted=inserted,
    )
    return inserted


def map_places_to_grid(
    source: str,
    source_priority: int = 100,
    *,
    country_filter: str | None = None,
) -> int:
    """For each place, link to its nearest grid cell for `source`.

    Uses PostGIS to compute the nearest neighbour and the great-circle
    distance in metres. Idempotent on (place_id, source).

    `country_filter` (ISO alpha-2, e.g. 'IN') restricts the mapping to
    places in one country. This matters for IMD: its grids cover only
    India, so a place in Tokyo would otherwise be mapped to an IMD edge
    cell at ~5000 km, which is nonsense.
    """
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO place_grid_map (place_id, grid_cell_id, distance_m, source, source_priority)
            SELECT
              p.id AS place_id,
              g.id AS grid_cell_id,
              ST_Distance(p.geom, g.geom) AS distance_m,
              %s AS source,
              %s AS source_priority
            FROM places p
            CROSS JOIN LATERAL (
              SELECT g.id, g.geom
                FROM grid_cells g
               WHERE g.source = %s
            ORDER BY g.geom <-> p.geom
               LIMIT 1
            ) g
             WHERE %s::text IS NULL OR p.country_code = %s::text
            ON CONFLICT (place_id, source) DO UPDATE SET
              grid_cell_id    = EXCLUDED.grid_cell_id,
              distance_m      = EXCLUDED.distance_m,
              source_priority = EXCLUDED.source_priority
            """,
            (source, source_priority, source, country_filter, country_filter),
        )
        n = cur.rowcount
    log.info("grid.map_places.done", source=source, mapped=n, country=country_filter)
    return n


def populate_imd_grid(
    *,
    source: str,
    resolution_deg: float,
    lat0: float,
    lat1: float,
    lon0: float,
    lon1: float,
    batch_size: int = 500,
) -> int:
    """Insert every IMD grid cell into `grid_cells`.

    Unlike `populate_grid_at_places`, which sparsely places cells near
    each place we serve, this enumerates the full IMD grid because IMD's
    domain is small (India bbox) and small enough to fit cheaply. This
    means the nearest-neighbour lookup in `map_places_to_grid` finds a
    real native cell rather than one fabricated via `snap`.

    Bulk-inserts in batches because per-row inserts over the Supabase
    pooler add ~50ms each, which is unworkable for ~18k cells (rain) or
    even ~1k cells (temp). `psycopg.copy()` would be faster still but
    needs deduping logic; the multi-row INSERT lets us keep idempotency
    via `ON CONFLICT DO NOTHING`.
    """
    n_lat = int(round((lat1 - lat0) / resolution_deg)) + 1
    n_lon = int(round((lon1 - lon0) / resolution_deg)) + 1
    rows: list[tuple[str, float, float, float]] = []
    for i in range(n_lat):
        la = round(lat0 + i * resolution_deg, 6)
        for j in range(n_lon):
            lo = round(lon0 + j * resolution_deg, 6)
            rows.append((source, resolution_deg, la, lo))

    inserted = 0
    with transaction() as conn, conn.cursor() as cur:
        # The PostGIS geography GENERATED column + GIST index make per-row
        # inserts costly; the Supabase pooler also caps statement_timeout
        # generously. Both pressures push us toward modest batches.
        cur.execute("SET LOCAL statement_timeout = '5min'")
        for chunk_start in range(0, len(rows), batch_size):
            chunk = rows[chunk_start : chunk_start + batch_size]
            placeholders = ",".join(["(%s, %s, %s, %s)"] * len(chunk))
            sql = (
                "INSERT INTO grid_cells (source, resolution_deg, lat, lon) VALUES "
                + placeholders
                + " ON CONFLICT (source, lat, lon) DO NOTHING"
            )
            flat: list[object] = []
            for r in chunk:
                flat.extend(r)
            cur.execute(sql, flat)
            inserted += cur.rowcount

    log.info(
        "grid.populate.imd.done",
        source=source,
        resolution=resolution_deg,
        n_lat=n_lat,
        n_lon=n_lon,
        inserted=inserted,
    )
    return inserted


def populate_open_meteo_cells(
    *,
    source: str = "open_meteo",
    resolution_deg: float = 0.25,
) -> int:
    """Insert one `grid_cells` row per place at its nominal lat/lon.

    Open-Meteo is queried per-point, not per-grid: each place gets its
    own "cell" whose centre is the place's gazetteer coordinate. The
    underlying ERA5 grid Open-Meteo snaps to (~0.25°) is recorded only
    in source_provenance — the cell row stays anchored to the place
    coord so `daily_weather` rows join cleanly by (lat, lon).

    Unlike `populate_grid_at_places` (which writes a 3×3 window per
    place) or `populate_imd_grid` (which enumerates a regional grid),
    this is exactly 1:1.
    """
    inserted = 0
    with transaction() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, lat, lon FROM places ORDER BY id")
        places = cur.fetchall()
        for p in places:
            la = round(float(p["lat"]), 6)
            lo = round(float(p["lon"]), 6)
            cur.execute(
                """
                INSERT INTO grid_cells (source, resolution_deg, lat, lon)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (source, lat, lon) DO NOTHING
                """,
                (source, resolution_deg, la, lo),
            )
            if cur.rowcount:
                inserted += 1
    log.info(
        "grid.populate.open_meteo.done",
        source=source,
        places=len(places),
        inserted=inserted,
    )
    return inserted

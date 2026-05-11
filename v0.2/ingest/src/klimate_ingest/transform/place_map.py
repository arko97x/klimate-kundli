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


def map_places_to_grid(source: str, source_priority: int = 100) -> int:
    """For each place, link to its nearest grid cell for `source`.

    Uses PostGIS to compute the nearest neighbour and the great-circle
    distance in metres. Idempotent on (place_id, source).
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
            ON CONFLICT (place_id, source) DO UPDATE SET
              grid_cell_id    = EXCLUDED.grid_cell_id,
              distance_m      = EXCLUDED.distance_m,
              source_priority = EXCLUDED.source_priority
            """,
            (source, source_priority, source),
        )
        n = cur.rowcount
    log.info("grid.map_places.done", source=source, mapped=n)
    return n

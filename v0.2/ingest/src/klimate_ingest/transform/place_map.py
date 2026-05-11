"""Map each place in `places` to its nearest grid cell per source.

Workflow:

1. Walk a (lat, lon) grid covering the world (or a region) at the source's
   native resolution.
2. Insert one row per cell into `grid_cells` (idempotent on (source, lat, lon)).
3. For every place, find the nearest cell via PostGIS `<->` and write a
   `place_grid_map` row with the great-circle distance in metres.

This is a one-shot maintenance job: re-run after the place gazetteer
expands or after adding a new source.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..db import transaction
from ..logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class GridSpec:
    source: str
    resolution_deg: float
    lat_min: float = -90.0
    lat_max: float = 90.0
    lon_min: float = -180.0
    lon_max: float = 180.0


def _frange(start: float, stop: float, step: float) -> list[float]:
    n = int(math.floor((stop - start) / step + 1e-9)) + 1
    return [round(start + i * step, 6) for i in range(n)]


def populate_grid(spec: GridSpec) -> int:
    """Insert grid cells covering [lat_min..lat_max] × [lon_min..lon_max].

    Returns the number of new rows inserted (idempotent thanks to the
    UNIQUE (source, lat, lon) constraint).
    """
    lats = _frange(spec.lat_min, spec.lat_max, spec.resolution_deg)
    lons = _frange(spec.lon_min, spec.lon_max, spec.resolution_deg)
    inserted = 0
    with transaction() as conn, conn.cursor() as cur:
        for la in lats:
            for lo in lons:
                cur.execute(
                    """
                    INSERT INTO grid_cells (source, resolution_deg, lat, lon)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (source, lat, lon) DO NOTHING
                    """,
                    (spec.source, spec.resolution_deg, la, lo),
                )
                if cur.rowcount:
                    inserted += 1
    log.info("grid.populate.done", source=spec.source, inserted=inserted)
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

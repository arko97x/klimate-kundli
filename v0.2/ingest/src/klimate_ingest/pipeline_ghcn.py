"""End-to-end GHCN-Daily pipeline.

Three logical phases, exposed via separate CLI subcommands so each can
be re-run independently:

  1. **Catalog**: fetch `ghcnd-stations.txt` + `ghcnd-inventory.txt`,
     parse, and choose one "best" station per place that satisfies our
     coverage requirements (TMAX + TMIN + PRCP, intersects target years,
     within max_distance_km). Writes one `grid_cells` row per chosen
     station and a `place_grid_map` link.
  2. **Ingest**: for each place that has a chosen station, download the
     station's `.dly`, parse to a daily DataFrame, upsert into
     `daily_weather` with source='ghcn', stamp source_provenance.
  3. **Aggregate** (handled by the existing `aggregate` CLI with
     `--source ghcn`): rolls into annual_extremes / annual_rain /
     decade_rain / monthly_normals / season_prefix.

Why per-place 1:1 instead of all-stations?

The pilot universe has ~70 places. Mapping each to ONE good station
keeps the row count manageable and the kundli simple (each cell has a
single attributed source). We can later extend to multi-station blends
("nearest 3, weighted") if the curatorial team wants — the schema
already supports it via `place_grid_map.source_priority`.

Station selection algorithm
---------------------------

For each place p:
1. From inventory, collect station IDs s where:
     * element ∈ {TMAX, TMIN, PRCP},
     * y_end >= target_year_min  (e.g. 2010),
     * y_start <= target_year_min - 10  (need pre-baseline coverage too).
2. Group by station: keep stations that carry all three elements.
3. Compute great-circle distance(p, s); drop stations beyond
   `max_distance_km`.
4. Rank by a combined score:
     score = distance_km / 10  -  min(years_TMAX) bonus
   Closest with longest TMAX record wins. Ties broken by station_id.
5. If no station meets the criteria, place gets no GHCN mapping — the
   kundli simply falls through to the next-priority source (Open-Meteo /
   ERA5 / IMD) for that place.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pandas as pd

from .db import transaction
from .logging import get_logger
from .sources.ghcn_daily import ELEMENTS_CORE, GhcnDailySource
from .storage.r2 import R2Client
from .transform.ghcn_daily import parse_dly, parse_inventory, parse_stations
from .transform.upsert import stamp_provenance, upsert_daily_weather

log = get_logger(__name__)


@dataclass(frozen=True)
class StationPick:
    place_id: int
    place_slug: str
    place_lat: float
    place_lon: float
    station_id: str
    station_lat: float
    station_lon: float
    station_name: str
    distance_km: float
    elev_m: float | None
    tmax_y_start: int
    tmax_y_end: int


@dataclass(frozen=True)
class GhcnIngestResult:
    place_slug: str
    station_id: str
    rows_written: int
    daily_uri: str | None
    provenance_ids: list[int]


# ---------------------------------------------------------------------------
# station resolver
# ---------------------------------------------------------------------------


def resolve_stations(
    *,
    cache_dir: Path,
    max_distance_km: float = 50.0,
    target_year_min: int = 2010,
    history_year_min: int = 1990,
    elements: tuple[str, ...] = ELEMENTS_CORE,
    refresh_catalog: bool = False,
) -> list[StationPick]:
    """Pick one GHCN station per place; write grid_cells + place_grid_map.

    Returns the list of picks (one per place that found a station).
    Places that fail the coverage filter are absent from the result.
    """
    src = GhcnDailySource()
    cat = src.fetch_catalog(cache_dir, refresh=refresh_catalog)
    stations = parse_stations(cat["stations"])
    inventory = parse_inventory(cat["inventory"])

    # Filter inventory to interesting elements + years.
    inv = inventory[
        inventory["element"].isin(list(elements))
        & (inventory["y_end"] >= target_year_min)
        & (inventory["y_start"] <= history_year_min)
    ].copy()
    if inv.empty:
        log.warning("ghcn.resolve.no_inventory")
        return []

    # Stations carrying ALL required elements with the window we want.
    by_station = inv.groupby("station_id")["element"].apply(set)
    eligible_ids = by_station[by_station >= set(elements)].index.tolist()
    inv = inv[inv["station_id"].isin(eligible_ids)]

    # Min span of TMAX per station (used for tie-break ranking).
    tmax_span = (
        inv[inv["element"] == "TMAX"]
        .groupby("station_id")
        .agg(y_start=("y_start", "min"), y_end=("y_end", "max"))
    )

    eligible_stations = stations[stations["station_id"].isin(eligible_ids)].copy()
    eligible_stations = eligible_stations.merge(
        tmax_span, left_on="station_id", right_index=True, how="left",
    )
    log.info(
        "ghcn.resolve.eligible",
        elements=list(elements),
        target_year_min=target_year_min,
        history_year_min=history_year_min,
        n_stations=len(eligible_stations),
    )

    # Pull places.
    with transaction() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, slug, name, country_code, lat, lon FROM places ORDER BY id")
        places = cur.fetchall()

    # Current year for "freshness" scoring below.
    from datetime import date as _date
    this_year = _date.today().year

    picks: list[StationPick] = []
    for p in places:
        plat = float(p["lat"])
        plon = float(p["lon"])
        # Coarse bbox cut (~1° per ~111km) before haversine — keeps the
        # full-station O(N*M) at bay. 5° box around the place is plenty
        # for max_distance_km=50, with a margin for high-latitude places.
        deg = max(max_distance_km / 100.0, 0.5)
        band = eligible_stations[
            (eligible_stations["lat"].between(plat - deg, plat + deg))
            & (eligible_stations["lon"].between(plon - deg, plon + deg))
        ].copy()
        if band.empty:
            log.info("ghcn.resolve.no_band", slug=p["slug"], deg=deg)
            continue
        band["distance_km"] = band.apply(
            lambda r: _haversine_km(plat, plon, float(r["lat"]), float(r["lon"])),
            axis=1,
        )
        band = band[band["distance_km"] <= max_distance_km]
        if band.empty:
            log.info("ghcn.resolve.too_far", slug=p["slug"])
            continue
        # Score: lower is better.
        #   distance_km / 5     -- prefer closer (5km per unit)
        #   + freshness_penalty -- last data year before "this year" cost
        #   - wmo_bonus         -- WMO airport / synoptic stations are
        #                          near-continuous; the gappy heritage
        #                          stations (e.g. NYC USC00305816 with a
        #                          1960-2022 hole) rarely have a WMO id.
        #   - gsn_bonus         -- WMO Global Surface Network reference
        #                          stations have explicit continuity SLAs.
        band["y_end_filled"]   = band["y_end"].fillna(0).astype(int)
        band["y_start_filled"] = band["y_start"].fillna(9999).astype(int)
        # bool(nan) is True in Python; gate on string-ness explicitly.
        band["wmo_bonus"] = band["wmo_id"].apply(
            lambda v: 5.0 if isinstance(v, str) and v.strip() else 0.0
        )
        band["gsn_bonus"] = band["gsn_flag"].apply(
            lambda v: 3.0 if (isinstance(v, str) and v == "GSN") else 0.0
        )
        band["freshness_penalty"] = (this_year - band["y_end_filled"]).clip(lower=0) * 0.5
        band["score"] = (
            band["distance_km"] / 5.0
            + band["freshness_penalty"]
            - band["wmo_bonus"]
            - band["gsn_bonus"]
        )
        band = band.sort_values(
            by=["score", "y_start_filled", "station_id"],
            ascending=[True, True, True],
        )
        chosen = band.iloc[0]
        picks.append(
            StationPick(
                place_id=int(p["id"]),
                place_slug=str(p["slug"]),
                place_lat=plat,
                place_lon=plon,
                station_id=str(chosen["station_id"]),
                station_lat=float(chosen["lat"]),
                station_lon=float(chosen["lon"]),
                station_name=str(chosen["name"]),
                distance_km=float(chosen["distance_km"]),
                elev_m=(None if pd.isna(chosen["elev_m"]) else float(chosen["elev_m"])),
                tmax_y_start=int(chosen["y_start"]) if not pd.isna(chosen["y_start"]) else 0,
                tmax_y_end=int(chosen["y_end"]) if not pd.isna(chosen["y_end"]) else 0,
            )
        )

    log.info(
        "ghcn.resolve.done",
        places=len(places),
        picks=len(picks),
    )

    _write_grid_and_map(picks)
    return picks


def _write_grid_and_map(picks: list[StationPick]) -> None:
    """Insert one grid_cells row per chosen station + a place_grid_map link."""
    if not picks:
        return
    with transaction() as conn, conn.cursor() as cur:
        for p in picks:
            la = round(p.station_lat, 6)
            lo = round(p.station_lon, 6)
            cur.execute(
                """
                INSERT INTO grid_cells (source, resolution_deg, lat, lon)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (source, lat, lon) DO NOTHING
                RETURNING id
                """,
                ("ghcn", 0.0, la, lo),
            )
            row = cur.fetchone()
            if row is None:
                # Already existed; look it up.
                cur.execute(
                    "SELECT id FROM grid_cells WHERE source='ghcn' AND lat=%s AND lon=%s",
                    (la, lo),
                )
                row = cur.fetchone()
            if row is None:
                # Should never happen, but be defensive.
                log.warning("ghcn.cell.upsert.failed", station_id=p.station_id)
                continue
            grid_cell_id = int(row["id"])

            cur.execute(
                """
                INSERT INTO place_grid_map (place_id, grid_cell_id, distance_m, source, source_priority)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (place_id, source) DO UPDATE SET
                  grid_cell_id    = EXCLUDED.grid_cell_id,
                  distance_m      = EXCLUDED.distance_m,
                  source_priority = EXCLUDED.source_priority
                """,
                (
                    p.place_id,
                    grid_cell_id,
                    p.distance_km * 1000.0,
                    "ghcn",
                    5,  # cfg.SOURCE_PRIORITY["ghcn"]
                ),
            )
    log.info("ghcn.grid_map.written", n=len(picks))


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# per-place ingest
# ---------------------------------------------------------------------------


def process_ghcn_place(
    *,
    pick: StationPick,
    cache_dir: Path,
    scratch_dir: Path,
    license: str,
    citation: str,
    upload: bool = True,
    r2: R2Client | None = None,
    quality: int = 5,
    source: str = "ghcn",
) -> GhcnIngestResult:
    """Fetch + parse one station, upsert into daily_weather, stamp provenance."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    scratch_dir.mkdir(parents=True, exist_ok=True)

    src = GhcnDailySource()
    meta = src.fetch_station_dly(station_id=pick.station_id, cache_dir=cache_dir)
    dly_path = Path(str(meta["path"]))

    df = parse_dly(dly_path)
    if df.empty:
        log.warning(
            "ghcn.station.empty",
            slug=pick.place_slug,
            station_id=pick.station_id,
        )
        return GhcnIngestResult(
            place_slug=pick.place_slug,
            station_id=pick.station_id,
            rows_written=0,
            daily_uri=None,
            provenance_ids=[],
        )

    # Reshape to the columns daily_weather upsert expects. The join key
    # is (lat, lon); we stamp the station's coords (which match what we
    # wrote into grid_cells via `_write_grid_and_map`).
    df = df.assign(
        lat=round(pick.station_lat, 6),
        lon=round(pick.station_lon, 6),
    )
    keep = ["date", "lat", "lon", "tmax_c", "tmin_c", "precip_mm"]
    df = df[keep]

    parquet_local = scratch_dir / f"ghcn_{pick.place_slug}_{pick.station_id}.parquet"
    df.to_parquet(parquet_local, index=False)
    log.info(
        "pipeline.ghcn.parquet.written",
        path=str(parquet_local),
        bytes=parquet_local.stat().st_size,
        rows=len(df),
    )

    daily_uri: str | None = None
    if upload:
        r2 = r2 or R2Client.from_env()
        daily_key = (
            f"daily/{source}/{pick.place_slug}/"
            f"{source}_{pick.place_slug}_{pick.station_id}.parquet"
        )
        daily_uri = r2.upload_file(
            parquet_local, daily_key, content_type="application/x-parquet",
        )

    value_columns = [c for c in ("tmax_c", "tmin_c", "precip_mm") if c in df.columns]
    rows_written = upsert_daily_weather(
        df=df,
        source=source,
        value_columns=value_columns,
        source_version=pick.station_id,
        quality=quality,
    )

    # Compute actual coverage from the dataframe for the provenance row.
    date_min = df["date"].min()
    date_max = df["date"].max()
    if isinstance(date_min, pd.Timestamp):
        date_min = date_min.date()
    if isinstance(date_max, pd.Timestamp):
        date_max = date_max.date()
    if not isinstance(date_min, date):
        date_min = date(pick.tmax_y_start or 1900, 1, 1)
    if not isinstance(date_max, date):
        date_max = date(pick.tmax_y_end or 2024, 12, 31)

    notes = json.dumps(
        {
            "station_id":   pick.station_id,
            "station_name": pick.station_name,
            "distance_km":  round(pick.distance_km, 3),
            "elev_m":       pick.elev_m,
            "slug":         pick.place_slug,
        }
    )
    bbox = {
        "n": pick.station_lat + 0.05, "s": pick.station_lat - 0.05,
        "w": pick.station_lon - 0.05, "e": pick.station_lon + 0.05,
    }

    prov_ids: list[int] = []
    for var in ("tmax", "tmin", "precip"):
        col = {"tmax": "tmax_c", "tmin": "tmin_c", "precip": "precip_mm"}[var]
        if col not in df.columns or df[col].notna().sum() == 0:
            continue
        prov_ids.append(
            stamp_provenance(
                source=source,
                source_version=pick.station_id,
                variable=var,
                date_start=date_min,
                date_end=date_max,
                area_bbox=bbox,
                license=license,
                citation=citation,
                storage_uri=daily_uri,
                bytes_=int(meta["bytes"]),
                checksum=str(meta["checksum"]),
                notes=notes,
            )
        )

    return GhcnIngestResult(
        place_slug=pick.place_slug,
        station_id=pick.station_id,
        rows_written=rows_written,
        daily_uri=daily_uri,
        provenance_ids=prov_ids,
    )

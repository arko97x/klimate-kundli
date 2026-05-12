"""GHCN-Daily flat files → tidy DataFrames.

Three parsers here:

* `parse_stations(path)`  — `ghcnd-stations.txt` → DataFrame[station_id, lat, lon, elev_m, name, country_code, wmo_id, gsn_flag].
* `parse_inventory(path)` — `ghcnd-inventory.txt` → DataFrame[station_id, lat, lon, element, y_start, y_end].
* `parse_dly(path)`       — one station's `.dly` → DataFrame[station_id, date, tmax_c, tmin_c, precip_mm].

The .dly format is the painful one: fixed-width, with 31 day-slots per
(station, year, month, element) line. We unfold and pivot to per-day,
per-variable in long form, then pivot wide so daily_weather upsert can
COALESCE columns in place.

Quality filter: rows with QFLAG (QC fail flag) set to anything other
than the single space ' ' are dropped per-(day, element). This is what
the daily summary product (GSOD) does. MFLAG (measurement) and SFLAG
(source) are not used as filters — they're informational.

Missing value sentinel: -9999. We convert to NaN.

Units in the .dly:
* TMAX, TMIN, TAVG: tenths of °C   → divide by 10
* PRCP:             tenths of mm   → divide by 10
* SNOW, SNWD:       millimetres    → as-is (we ignore them anyway)
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from ..logging import get_logger

log = get_logger(__name__)


# Element scale factors (value → physical unit). TMAX/TMIN/TAVG: °C; PRCP: mm.
_ELEMENT_SCALE: dict[str, float] = {
    "TMAX": 0.1,
    "TMIN": 0.1,
    "TAVG": 0.1,
    "PRCP": 0.1,
}
_MISSING_INT = -9999


# ---------------------------------------------------------------------------
# stations / inventory
# ---------------------------------------------------------------------------


def parse_stations(path: Path) -> pd.DataFrame:
    """Parse `ghcnd-stations.txt` fixed-width.

    Format (1-indexed columns from NOAA README):
      1- 11  station ID
     13- 20  latitude (decimal degrees, F8.4)
     22- 30  longitude (F9.4)
     32- 37  elevation in metres (F6.1, -999.9 = missing)
     39- 40  state (US only)
     42- 71  name
     73- 75  GSN flag ('GSN' if part of WMO reference network)
     77- 79  HCN/CRN flag
     81- 85  WMO id (5 digits, or blank)
    """
    rows: list[dict[str, object]] = []
    with path.open("r", encoding="latin-1") as f:
        for line in f:
            if len(line) < 85:
                # Some lines short due to trailing trim.
                line = line.rstrip("\n").ljust(85, " ")
            station_id = line[0:11].strip()
            if not station_id:
                continue
            try:
                lat = float(line[12:20].strip())
                lon = float(line[21:30].strip())
            except ValueError:
                continue
            elev_raw = line[31:37].strip()
            try:
                elev_m: float | None = float(elev_raw) if elev_raw else None
                if elev_m == -999.9:
                    elev_m = None
            except ValueError:
                elev_m = None
            state = line[38:40].strip() or None
            name = line[41:71].strip()
            gsn  = line[72:75].strip() or None
            hcn  = line[76:79].strip() or None
            wmo  = line[80:85].strip() or None
            rows.append({
                "station_id":   station_id,
                "lat":          lat,
                "lon":          lon,
                "elev_m":       elev_m,
                "state":        state,
                "name":         name,
                "gsn_flag":     gsn,
                "hcn_flag":     hcn,
                "wmo_id":       wmo,
                # Country code = first 2 chars of station_id. NOT strict ISO,
                # but stable enough for spatial filtering ("IN" = India,
                # "US" = USA, etc.). Maps cleanly for the major countries
                # in our pilot, divergent only for a few small territories.
                "country_code": station_id[:2],
            })
    df = pd.DataFrame.from_records(rows)
    log.info("ghcn.parse.stations", rows=len(df))
    return df


def parse_inventory(path: Path) -> pd.DataFrame:
    """Parse `ghcnd-inventory.txt`. One row per (station, element).

    Format:
      1- 11  station ID
     13- 20  latitude
     22- 30  longitude
     32- 35  element
     37- 40  first year
     42- 45  last year
    """
    cols = ["station_id", "lat", "lon", "element", "y_start", "y_end"]
    rows: list[tuple[object, ...]] = []
    with path.open("r", encoding="latin-1") as f:
        for line in f:
            if len(line) < 45:
                continue
            try:
                rows.append((
                    line[0:11].strip(),
                    float(line[12:20].strip()),
                    float(line[21:30].strip()),
                    line[31:35].strip(),
                    int(line[36:40].strip()),
                    int(line[41:45].strip()),
                ))
            except ValueError:
                continue
    df = pd.DataFrame.from_records(rows, columns=cols)
    log.info("ghcn.parse.inventory", rows=len(df))
    return df


# ---------------------------------------------------------------------------
# .dly
# ---------------------------------------------------------------------------


def parse_dly(path: Path, *, elements: tuple[str, ...] = ("TMAX", "TMIN", "PRCP")) -> pd.DataFrame:
    """Parse one station's .dly file to a tidy daily DataFrame.

    Returns columns: station_id, date, tmax_c, tmin_c, precip_mm
    (only the columns present in `elements` will appear; missing values
    become NaN).
    """
    long_rows: list[tuple[object, ...]] = []
    wanted = set(elements)

    with path.open("r", encoding="latin-1") as f:
        for line in f:
            if len(line) < 269:
                continue
            station_id = line[0:11]
            year_s     = line[11:15]
            month_s    = line[15:17]
            element    = line[17:21]
            if element not in wanted:
                continue
            try:
                year  = int(year_s)
                month = int(month_s)
            except ValueError:
                continue
            scale = _ELEMENT_SCALE.get(element, 1.0)

            # 31 day slots, each 8 chars: VALUE(5) MFLAG(1) QFLAG(1) SFLAG(1).
            base = 21
            for day in range(1, 32):
                pos = base + (day - 1) * 8
                v_s = line[pos:pos + 5]
                qflag = line[pos + 6]
                try:
                    v_int = int(v_s)
                except ValueError:
                    continue
                if v_int == _MISSING_INT:
                    continue
                # QC failed → skip (treat as missing). MFLAG/SFLAG ignored.
                if qflag.strip() != "":
                    continue
                # Day must be valid for the calendar month.
                try:
                    d = date(year, month, day)
                except ValueError:
                    continue
                long_rows.append((station_id, d, element, v_int * scale))

    if not long_rows:
        log.info("ghcn.parse.dly.empty", path=str(path))
        return pd.DataFrame(columns=["station_id", "date", "tmax_c", "tmin_c", "precip_mm"])

    long_df = pd.DataFrame.from_records(
        long_rows, columns=["station_id", "date", "element", "value"],
    )
    # Pivot wide so daily_weather columns line up.
    wide = long_df.pivot_table(
        index=["station_id", "date"],
        columns="element",
        values="value",
        aggfunc="first",
    ).reset_index()
    wide.columns.name = None
    wide = wide.rename(columns={"TMAX": "tmax_c", "TMIN": "tmin_c", "PRCP": "precip_mm"})
    for col in ("tmax_c", "tmin_c", "precip_mm"):
        if col not in wide.columns:
            wide[col] = np.nan

    keep = ["station_id", "date", "tmax_c", "tmin_c", "precip_mm"]
    wide = wide[keep]

    log.info(
        "ghcn.parse.dly",
        path=str(path),
        days=int(wide["date"].nunique()),
        rows=len(wide),
        non_null_tmax=int(wide["tmax_c"].notna().sum()),
        non_null_tmin=int(wide["tmin_c"].notna().sum()),
        non_null_precip=int(wide["precip_mm"].notna().sum()),
    )
    return wide

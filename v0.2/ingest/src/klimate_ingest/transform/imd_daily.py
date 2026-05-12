"""IMD .grd → daily DataFrame.

The IMD grids ship pre-aggregated to daily cadence, so unlike the
ERA5 transform (which sums/min/maxes hourly into daily), this is a
straight reshape from xarray's (time, lat, lon) cube to a flat
(date, lat, lon, value) DataFrame.

Special handling:

* Missing values are stored as the sentinel `-999.0` in IMD .grd files.
  imdlib leaves them in the xarray as-is; we mask them to NaN here so
  downstream `COUNT(*) FILTER (WHERE col IS NOT NULL)` works correctly.
* For temperature: `tmax` and `tmin` ship as separate .grd files, so
  this transform produces one variable column per call. The upsert
  layer COALESCEs tmax onto an existing tmin row (or vice versa) using
  the same (place_id, date, source) PK.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ..logging import get_logger
from .daily import DailyFrame

log = get_logger(__name__)


# IMD .grd missing-value sentinel (imdlib leaves this as-is).
_IMD_MISSING = -999.0


def imd_to_daily(
    *,
    cache_dir: Path,
    variable: str,
    year: int,
) -> DailyFrame:
    """Read one IMD .grd via imdlib and return a daily DataFrame."""
    import imdlib as imd  # lazy

    data = imd.open_data(variable, year, year, "yearwise", str(cache_dir))
    ds = data.get_xarray()

    if variable == "rain":
        return _rain_to_daily(ds, year=year)
    if variable in ("tmax", "tmin"):
        return _temp_to_daily(ds, variable=variable, year=year)
    raise ValueError(f"unknown IMD variable: {variable!r}")


def _rain_to_daily(ds, *, year: int) -> DailyFrame:
    da = ds["rain"]
    df = _melt(da, value_name="precip_mm")
    log.info(
        "transform.imd.daily.rain",
        year=year,
        cells=int(df[["lat", "lon"]].drop_duplicates().shape[0]),
        days=int(df["date"].nunique()),
        rows=len(df),
    )
    return DailyFrame(
        df=df,
        variable="precip",
        value_columns=["precip_mm"],
        units={"precip_mm": "mm"},
    )


def _temp_to_daily(ds, *, variable: str, year: int) -> DailyFrame:
    da = ds[variable]
    col = "tmax_c" if variable == "tmax" else "tmin_c"
    df = _melt(da, value_name=col)
    log.info(
        "transform.imd.daily.temp",
        year=year,
        variable=variable,
        cells=int(df[["lat", "lon"]].drop_duplicates().shape[0]),
        days=int(df["date"].nunique()),
        rows=len(df),
    )
    return DailyFrame(
        df=df,
        variable=variable,
        value_columns=[col],
        units={col: "C"},
    )


def _melt(da, *, value_name: str) -> pd.DataFrame:
    """Cube (time, lat, lon) → tidy DataFrame with NaN missing values."""
    arr = da.values.astype("float32", copy=False)
    arr = np.where(arr == _IMD_MISSING, np.nan, arr)

    times = pd.to_datetime(da["time"].values).normalize()
    lats = np.asarray(da["lat"].values, dtype="float64").round(6)
    lons = np.asarray(da["lon"].values, dtype="float64").round(6)

    # Drop cells that are NaN for the entire year — common for IMD ocean
    # cells and out-of-India interpolation gaps. This shrinks the row
    # count by ~40% for rain.
    nz_mask = ~np.isnan(arr).all(axis=0)
    if not nz_mask.any():
        return pd.DataFrame(columns=["date", "lat", "lon", value_name])
    nz_indices = np.argwhere(nz_mask)
    lat_idx = nz_indices[:, 0]
    lon_idx = nz_indices[:, 1]
    sub = arr[:, lat_idx, lon_idx]

    n_t, n_cells = sub.shape
    out = pd.DataFrame(
        {
            "date": np.repeat(times.date, n_cells),
            "lat": np.tile(lats[lat_idx], n_t),
            "lon": np.tile(lons[lon_idx], n_t),
            value_name: sub.reshape(-1),
        }
    )
    return out

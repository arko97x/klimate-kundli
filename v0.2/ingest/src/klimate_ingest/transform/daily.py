"""Hourly NetCDF → daily DataFrame for ERA5-style chunks.

Input: a single-variable, single-month NetCDF as written by `cdsapi` from
`reanalysis-era5-single-levels` (or `reanalysis-era5-land`). The cube is
(time, latitude, longitude) on the source's native grid.

Output: a pandas DataFrame with columns (date, lat, lon, …value columns)
in normalised units:

  - 2m_temperature  →  tmax_c, tmin_c, tavg_c  (°C)
  - total_precipitation → precip_mm            (mm/day)

Conventions:

* Time is UTC. ERA5 hourly TP at hour t is accumulated precipitation in
  the (t−1, t] window in metres, so summing 00..23 of a UTC day gives the
  accumulation in (prev-day 23:00, this-day 23:00]. That is a one-hour
  shift vs. midnight-to-midnight; for daily aggregates over a 30-yr
  window the bias is below precision and we accept it for v0.2.
* Temperatures are simple per-day min/max/mean of hourly values, K → °C.
* We do not interpolate or fill missing hours; xarray's reducers ignore
  NaN. Cells with all-NaN days surface as NaN rows.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import xarray as xr

from ..logging import get_logger

log = get_logger(__name__)


_TEMP_VARS = frozenset({"tavg", "tmax", "tmin"})
_PRECIP_VARS = frozenset({"precip"})


@dataclass(frozen=True)
class DailyFrame:
    df: pd.DataFrame              # date, lat, lon, plus value columns
    variable: str                 # short name passed in ('tavg' | 'precip' | …)
    value_columns: list[str]      # which columns this frame carries
    units: dict[str, str]


def netcdf_to_daily(nc_path: Path, variable: str) -> DailyFrame:
    """Aggregate one CDS NetCDF chunk from hourly to daily."""
    nc_path = Path(nc_path)
    ds = xr.open_dataset(nc_path)
    try:
        return _to_daily(ds, variable)
    finally:
        ds.close()


def _to_daily(ds: xr.Dataset, variable: str) -> DailyFrame:
    lat_name = _first_present(ds, ("latitude", "lat"))
    lon_name = _first_present(ds, ("longitude", "lon"))
    time_name = _first_present(ds, ("valid_time", "time"))

    # Normalise dim names so downstream code can rely on them.
    rename: dict[str, str] = {}
    if lat_name != "lat":
        rename[lat_name] = "lat"
    if lon_name != "lon":
        rename[lon_name] = "lon"
    if time_name != "time":
        rename[time_name] = "time"
    if rename:
        ds = ds.rename(rename)

    # Daily bucket (UTC). `.floor("D")` keeps timestamps as a datetime64
    # so xarray's groupby works without warnings.
    date_idx = pd.to_datetime(ds["time"].values).floor("D")

    if variable in _TEMP_VARS:
        var = _pick_temp_var(ds)
        da_c = ds[var] - 273.15
        da_c = da_c.assign_coords(time=date_idx)
        tmax = da_c.groupby("time").max().rename("tmax_c")
        tmin = da_c.groupby("time").min().rename("tmin_c")
        tavg = da_c.groupby("time").mean().rename("tavg_c")
        out = xr.merge([tmax, tmin, tavg], compat="override").rename({"time": "date"})
        df = out.to_dataframe().reset_index()
        df = df[["date", "lat", "lon", "tmax_c", "tmin_c", "tavg_c"]]
        df["date"] = pd.to_datetime(df["date"]).dt.date
        df["lat"] = df["lat"].astype(float).round(6)
        df["lon"] = df["lon"].astype(float).round(6)
        log.info(
            "transform.daily.temp",
            cells=int(df[["lat", "lon"]].drop_duplicates().shape[0]),
            days=int(df["date"].nunique()),
            rows=len(df),
        )
        return DailyFrame(
            df=df,
            variable=variable,
            value_columns=["tmax_c", "tmin_c", "tavg_c"],
            units={"tmax_c": "C", "tmin_c": "C", "tavg_c": "C"},
        )

    if variable in _PRECIP_VARS:
        var = _pick_precip_var(ds)
        da_mm = ds[var] * 1000.0
        da_mm = da_mm.assign_coords(time=date_idx)
        rain = da_mm.groupby("time").sum().rename("precip_mm")
        out = rain.to_dataset().rename({"time": "date"})
        df = out.to_dataframe().reset_index()
        df = df[["date", "lat", "lon", "precip_mm"]]
        df["date"] = pd.to_datetime(df["date"]).dt.date
        df["lat"] = df["lat"].astype(float).round(6)
        df["lon"] = df["lon"].astype(float).round(6)
        log.info(
            "transform.daily.precip",
            cells=int(df[["lat", "lon"]].drop_duplicates().shape[0]),
            days=int(df["date"].nunique()),
            rows=len(df),
        )
        return DailyFrame(
            df=df,
            variable=variable,
            value_columns=["precip_mm"],
            units={"precip_mm": "mm"},
        )

    raise ValueError(f"unknown variable for daily transform: {variable!r}")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _first_present(ds: xr.Dataset, candidates: tuple[str, ...]) -> str:
    for c in candidates:
        if c in ds.dims or c in ds.coords:
            return c
    raise KeyError(f"none of {candidates} present in dataset (have {list(ds.dims)})")


def _pick_temp_var(ds: xr.Dataset) -> str:
    # CDS NetCDF for ERA5 2m_temperature exposes 't2m' (sometimes '2t' in
    # GRIB-converted files). Be tolerant.
    for v in ("t2m", "2t", "T2M"):
        if v in ds.data_vars:
            return v
    raise KeyError(f"no 2m-temperature variable in dataset (have {list(ds.data_vars)})")


def _pick_precip_var(ds: xr.Dataset) -> str:
    for v in ("tp", "TP", "total_precipitation"):
        if v in ds.data_vars:
            return v
    raise KeyError(f"no total-precipitation variable in dataset (have {list(ds.data_vars)})")

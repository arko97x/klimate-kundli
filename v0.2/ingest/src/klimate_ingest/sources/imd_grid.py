"""IMD Pune gridded daily rainfall and temperature.

IMD (India Meteorological Department, Pune) publishes two gridded daily
products that anchor the India layer of the kundli:

  * `imd_rain` — 0.25° rainfall, 1901–latest year, mm/day per cell.
    Grid: 129 lat × 135 lon, lat 6.5..38.5, lon 66.5..100.0.
  * `imd_temp` — 1.0°  tmax / tmin, 1951–latest, °C per cell.
    Grid:  31 lat ×  31 lon, lat 7.5..37.5, lon 67.5..97.5.

Both are distributed as Fortran binary `.grd` files via IMD's CMPG portal.
We use `imdlib` to download and parse them: it handles record layout,
the -999 missing sentinel, and produces a clean `xarray.Dataset` with
correctly-labelled coordinates and units.

One chunk = one (variable, year). Years are atomic: a partial year is
not useful for annual rollups, and the .grd format is per-year, so the
queue grain matches the file grain. This is unlike ERA5 where we go
per-month.

Public license; attribution to IMD required when redistributing.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from ..logging import get_logger
from .base import FetchResult

log = get_logger(__name__)


IMD_VARIABLES = ("rain", "tmax", "tmin")

# Source tag per variable. The DB / aggregate / kundli builder use these.
IMD_SOURCE_FOR: dict[str, str] = {
    "rain": "imd_rain",
    "tmax": "imd_temp",
    "tmin": "imd_temp",
}

# Native grid spec, used by the place mapper to enumerate cells without
# brittle snap math.
IMD_GRID_SPECS: dict[str, dict[str, float | int]] = {
    "imd_rain": {"resolution": 0.25, "lat0": 6.5, "lat1": 38.5, "lon0": 66.5, "lon1": 100.0},
    "imd_temp": {"resolution": 1.0,  "lat0": 7.5, "lat1": 37.5, "lon0": 67.5, "lon1":  97.5},
}

# India bbox written into source_provenance for every fetched chunk.
IMD_AREA_BBOX: dict[str, float] = {"n": 38.5, "s": 6.5, "w": 66.5, "e": 100.0}


@dataclass(frozen=True)
class ImdGridSource:
    name: str = "imd_grid"
    license: str = "IMD Pune; attribution required when redistributing."

    def fetch_year(
        self,
        *,
        variable: str,
        year: int,
        cache_dir: Path,
    ) -> FetchResult:
        """Download one year of one variable to `cache_dir`.

        Cache layout follows imdlib's convention so a re-run picks up the
        existing file: `cache_dir/<variable>/<year>.grd`.
        """
        if variable not in IMD_VARIABLES:
            raise ValueError(f"unknown IMD variable: {variable!r}")

        cache_dir.mkdir(parents=True, exist_ok=True)
        sub = cache_dir / variable
        sub.mkdir(parents=True, exist_ok=True)
        expected = sub / f"{year}.grd"

        log.info("imd.fetch.start", variable=variable, year=year, out=str(expected))

        import imdlib as imd  # lazy import; pandas/xarray heavy

        if not expected.exists():
            imd.get_data(variable, year, year, fn_format="yearwise", file_dir=str(cache_dir))
        else:
            log.info("imd.fetch.cached", variable=variable, year=year)

        if not expected.exists():
            raise FileNotFoundError(
                f"imdlib reported success but {expected} is missing; "
                "IMD portal may have refused the request."
            )

        size = expected.stat().st_size
        digest = _sha256_of_file(expected)
        log.info(
            "imd.fetch.done",
            variable=variable,
            year=year,
            bytes=size,
            checksum=digest,
        )
        return FetchResult(storage_uri=str(expected), bytes=size, checksum=digest)


def _sha256_of_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

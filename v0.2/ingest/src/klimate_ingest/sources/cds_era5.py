"""ERA5 / ERA5-Land via Copernicus CDS.

This module talks to CDS through the `cdsapi` client. It pulls one
(variable, year, month, area) chunk at a time so that:

  * resumes are cheap (one chunk failure doesn't lose a year),
  * the chunk maps cleanly to one Parquet object in R2,
  * concurrency is naturally throttled per chunk.

CDS has user-level fairness queues, not a hard requests/min limit. The
right strategy is *small concurrency, large chunks*: ask for a whole
month at a time, but only run 2-3 concurrent requests and back off on
queue rejections.

Datasets:
  - `reanalysis-era5-single-levels`        (global, 1940+, 0.25°)
  - `reanalysis-era5-land`                 (land,   1950+, 0.1°)

Variables we use for the kundli:
  - 2m_temperature                         (K, hourly)
  - total_precipitation                    (m, hourly accumulations)
"""

from __future__ import annotations

import calendar
import hashlib
from dataclasses import dataclass
from pathlib import Path

from ..logging import get_logger
from .base import FetchResult

log = get_logger(__name__)


CDS_DATASETS: dict[str, str] = {
    "era5":     "reanalysis-era5-single-levels",
    "era5land": "reanalysis-era5-land",
}

# Map our short variable names to CDS canonical names. Only the variables
# we actually need for the kundli are listed; extend as needed.
CDS_VARIABLE_NAMES: dict[str, str] = {
    "tmax":   "2m_temperature",     # daily max derived from hourly
    "tmin":   "2m_temperature",
    "tavg":   "2m_temperature",
    "precip": "total_precipitation",
}


@dataclass(frozen=True)
class CdsEra5Source:
    name: str = "era5"   # 'era5' or 'era5land'
    license: str = "Copernicus license; cite ECMWF/Copernicus when redistributing."

    @property
    def dataset(self) -> str:
        return CDS_DATASETS[self.name]

    def fetch_chunk(
        self,
        *,
        variable: str,
        year: int,
        month: int | None,
        area_bbox: dict[str, float],
        scratch_dir: Path,
    ) -> FetchResult:
        if variable not in CDS_VARIABLE_NAMES:
            raise ValueError(f"unknown variable for CDS: {variable!r}")
        if month is None:
            raise ValueError("CDS chunks are per-month for ERA5; pass month=1..12")

        scratch_dir.mkdir(parents=True, exist_ok=True)
        out = scratch_dir / f"{self.name}_{variable}_{year:04d}-{month:02d}.nc"

        request = self._build_request(variable=variable, year=year, month=month, area=area_bbox)

        log.info(
            "cds.fetch.start",
            dataset=self.dataset,
            variable=variable,
            year=year,
            month=month,
            area=area_bbox,
            out=str(out),
        )

        # Lazy import: cdsapi is heavy and we want config errors to surface
        # via klimate_ingest.config before this is loaded by tests.
        import cdsapi  # type: ignore[import-untyped]

        client = cdsapi.Client(
            # Reads CDSAPI_URL / CDSAPI_KEY from env or ~/.cdsapirc.
            wait_until_complete=True,
            quiet=False,
        )
        client.retrieve(self.dataset, request, str(out))

        size = out.stat().st_size
        digest = _sha256_of_file(out)
        log.info(
            "cds.fetch.done",
            dataset=self.dataset,
            variable=variable,
            year=year,
            month=month,
            bytes=size,
            checksum=digest,
        )
        return FetchResult(storage_uri=str(out), bytes=size, checksum=digest)

    def _build_request(
        self,
        *,
        variable: str,
        year: int,
        month: int,
        area: dict[str, float],
    ) -> dict[str, object]:
        days = [f"{d:02d}" for d in range(1, calendar.monthrange(year, month)[1] + 1)]
        times = [f"{h:02d}:00" for h in range(24)]
        # CDS area order: [North, West, South, East]
        area_list = [area["n"], area["w"], area["s"], area["e"]]
        return {
            "product_type": "reanalysis",
            "format": "netcdf",
            "variable": [CDS_VARIABLE_NAMES[variable]],
            "year": [f"{year:04d}"],
            "month": [f"{month:02d}"],
            "day": days,
            "time": times,
            "area": area_list,
        }


def _sha256_of_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

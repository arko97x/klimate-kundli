"""Open-Meteo Historical Weather API.

A point-based, daily-aggregated, ERA5-derived feed that works globally
from 1940 → today with no API key. We use it as the universal floor:
every place in `places` gets a complete daily history without the CDS
queue dance that direct ERA5 ingest requires.

Why not just direct ERA5?

* ERA5 from CDS is hourly NetCDFs over bboxes. Going 1940 → today over
  the whole globe is ~3 TB at 0.25°/hourly — infeasible on the free
  queue and overkill for what the kundli needs (daily extremes + decade
  totals).
* Open-Meteo serves the same ERA5 archive, but pre-aggregated to daily
  and queryable per-point. One HTTP call returns 85 years of daily
  tmax/tmin/precip for a single (lat, lon). ~900 KB, ~13 s.

What it costs:

* Open-Meteo is a third-party reprocessing layer over ECMWF's ERA5.
  Their bias correction and grid snapping is theirs, not ECMWF's.
  We tag rows `source = 'open_meteo'` so any analysis that wants the
  pure ECMWF release can filter it out and prefer `source = 'era5'`
  (which we still ingest for India and other curated regions).
* Free tier: 10k requests/day, 600 req/min. We only need ~70 (one per
  place), so headroom is huge.
* License: Apache-2 / CC-BY 4.0; attribution required when published.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

import pandas as pd

from ..logging import get_logger

log = get_logger(__name__)


OPEN_METEO_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_MIN_YEAR = 1940
DEFAULT_DAILY_VARS = (
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
)
# Open-Meteo column → our canonical daily_weather column.
_RENAME: dict[str, str] = {
    "temperature_2m_max": "tmax_c",
    "temperature_2m_min": "tmin_c",
    "precipitation_sum":  "precip_mm",
}


@dataclass(frozen=True)
class OpenMeteoResult:
    """One place × year-range fetch."""
    snapped_lat: float        # the actual ERA5 grid point Open-Meteo resolved
    snapped_lon: float
    elevation_m: float | None
    timezone: str
    df: pd.DataFrame          # columns: date, lat, lon, tmax_c, tmin_c, precip_mm
    payload_bytes: int        # raw JSON length (for provenance)
    request_url: str          # for audit


@dataclass(frozen=True)
class OpenMeteoSource:
    name: str = "open_meteo"
    license: str = (
        "Open-Meteo (CC-BY 4.0). Data derived from ECMWF ERA5; "
        "see https://open-meteo.com/en/license."
    )
    citation: str = (
        "Open-Meteo Historical Weather API "
        "(reanalysis: ECMWF ERA5)."
    )

    def fetch_place(
        self,
        *,
        lat: float,
        lon: float,
        year_start: int,
        year_end: int,
        daily_vars: tuple[str, ...] = DEFAULT_DAILY_VARS,
        timeout_s: int = 90,
        retries: int = 6,
    ) -> OpenMeteoResult:
        """Pull a daily archive for one point. Returns a flat DataFrame.

        Stamps `lat` and `lon` on every row using the *nominal* place
        coordinates we passed in, not Open-Meteo's snapped values. This
        keeps the join key in `daily_weather` lined up with the grid
        cell row we wrote at `(source='open_meteo', lat=place.lat, lon=place.lon)`.
        The snapped values are still preserved in `OpenMeteoResult` for
        provenance.
        """
        if year_start < OPEN_METEO_MIN_YEAR:
            raise ValueError(
                f"Open-Meteo archive starts {OPEN_METEO_MIN_YEAR}; "
                f"got year_start={year_start}"
            )
        if year_end < year_start:
            raise ValueError(f"year_end ({year_end}) < year_start ({year_start})")

        params = {
            "latitude":   f"{lat:.6f}",
            "longitude":  f"{lon:.6f}",
            "start_date": f"{year_start:04d}-01-01",
            "end_date":   f"{year_end:04d}-12-31",
            "daily":      ",".join(daily_vars),
            "timezone":   "UTC",
        }
        url = f"{OPEN_METEO_ENDPOINT}?{urllib.parse.urlencode(params)}"
        log.info("open_meteo.fetch.start", lat=lat, lon=lon,
                 y0=year_start, y1=year_end, vars=list(daily_vars))

        raw = _get_json_with_retry(url, timeout_s=timeout_s, retries=retries)
        if isinstance(raw, dict) and raw.get("error"):
            raise RuntimeError(f"Open-Meteo error: {raw.get('reason')!r}")

        daily = raw.get("daily")
        if not daily or not daily.get("time"):
            raise RuntimeError(f"Open-Meteo returned no daily data: {raw!r}")

        df = pd.DataFrame(daily)
        df = df.rename(columns=_RENAME)
        df["date"] = pd.to_datetime(df["time"]).dt.date
        df = df.drop(columns=["time"])
        # Stamp the nominal coords so the upsert join key matches the
        # grid_cells row we wrote for this place.
        df["lat"] = round(float(lat), 6)
        df["lon"] = round(float(lon), 6)
        # Reorder for readability + downstream consumers expect this.
        keep = ["date", "lat", "lon"] + [c for c in ("tmax_c", "tmin_c", "precip_mm") if c in df.columns]
        df = df[keep]

        log.info(
            "open_meteo.fetch.done",
            lat=lat, lon=lon, rows=len(df),
            days=int(df["date"].nunique()),
            snapped_lat=float(raw.get("latitude", 0.0)),
            snapped_lon=float(raw.get("longitude", 0.0)),
        )
        return OpenMeteoResult(
            snapped_lat=float(raw.get("latitude", lat)),
            snapped_lon=float(raw.get("longitude", lon)),
            elevation_m=(float(raw["elevation"]) if "elevation" in raw else None),
            timezone=str(raw.get("timezone", "UTC")),
            df=df,
            payload_bytes=len(json.dumps(raw)),
            request_url=url,
        )


def _get_json_with_retry(url: str, *, timeout_s: int, retries: int) -> dict[str, Any]:
    """GET + JSON-decode with backoff for 429 / 5xx / transient errors.

    Open-Meteo's per-IP throttle is computational, not request-count based:
    a single 85-year query can trip a 429 even though we're well under
    600 req/min. Empirically a 60-90 s pause clears it. We cap backoff at
    90 s and rely on `retries=6` to give ~4 min of grace per failure.
    """
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "klimate-kundli/0.2 (open-meteo ingest)"},
            )
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                body = resp.read()
            return json.loads(body)
        except urllib.error.HTTPError as e:
            # Retry on rate limit and server errors. 4xx other than 429 are fatal.
            if e.code in (429, 500, 502, 503, 504):
                last = e
                # On 429 specifically Open-Meteo's per-minute window
                # resets at minute boundaries, so a base wait of 30s plus
                # exponential jitter clears it more reliably than
                # 1/2/4/8 s. 5xx gets the same treatment — server load is
                # not our problem to solve quickly.
                backoff = min(30 + 5 * (2 ** attempt), 90)
                log.warning(
                    "open_meteo.retry",
                    attempt=attempt + 1,
                    code=e.code,
                    sleep_s=backoff,
                )
                time.sleep(backoff)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            backoff = min(10 * (2 ** attempt), 90)
            log.warning(
                "open_meteo.retry",
                attempt=attempt + 1,
                error=str(e),
                sleep_s=backoff,
            )
            time.sleep(backoff)
    raise RuntimeError(f"Open-Meteo request failed after {retries + 1} attempts: {last}")

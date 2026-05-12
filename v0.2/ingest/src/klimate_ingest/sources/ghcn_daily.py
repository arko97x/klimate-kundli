"""NOAA Global Historical Climatology Network — Daily (GHCN-D).

The closest thing to "ground truth" for surface temperature and rainfall.
~125,000 stations worldwide; many have records 1940+, hundreds 1900+,
a few back to the 1850s. Free, no auth, served via NCEI's public archive.

We use GHCN-D as the **top-priority overlay**: any place near a station
with TMAX/TMIN/PRCP coverage in our target years prefers GHCN over the
reanalysis layers (IMD, ERA5, Open-Meteo). GHCN catches what reanalysis
smooths away — urban heat island, microclimate, sharp coastal gradients,
station-level extremes.

Coverage caveats:

* Sparse in much of the developing world, dense in OECD countries.
  India has decent coverage but inconsistent record lengths; coastal
  Africa and oceans are largely empty.
* QC flags exist per (day, variable). For v0.2 we drop only the values
  flagged with QFLAG != ' ' (i.e. failed an automated QC check) and
  keep the rest, treating missing as NaN. This is the same posture as
  ERA5: trust the source's reduction, surface gaps as gaps.
* Element values are stored as integers in tenths of the native unit
  (TMAX/TMIN: tenths of °C; PRCP: tenths of mm; SNOW/SNWD: mm). We
  divide accordingly in the transform.

What we fetch:

* `ghcnd-stations.txt` — one row per station with lat, lon, elev, name,
  WMO id, GSN reference flag.
* `ghcnd-inventory.txt` — one row per (station, element, year_start,
  year_end). Lets us pre-filter to stations that actually carry the
  variables we want.
* `all/<id>.dly` — fixed-width per-station daily archive. Each line is
  station × month × element with 31 day-slots.

Public domain; recommended citation: Menne et al. (2012), Journal of
Atmospheric and Oceanic Technology.
"""

from __future__ import annotations

import hashlib
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from ..logging import get_logger

log = get_logger(__name__)


GHCN_BASE = "https://www.ncei.noaa.gov/pub/data/ghcn/daily/"
STATIONS_URL  = f"{GHCN_BASE}ghcnd-stations.txt"
INVENTORY_URL = f"{GHCN_BASE}ghcnd-inventory.txt"
STATION_DLY_FMT = f"{GHCN_BASE}all/{{station_id}}.dly"

# Elements we care about. The .dly format includes many others (SNOW,
# SNWD, AWND, ...); we ignore them. TAVG is a station-reported daily
# mean and is preferred only when TMAX/TMIN are missing.
ELEMENTS_CORE = ("TMAX", "TMIN", "PRCP")


@dataclass(frozen=True)
class GhcnDailySource:
    name: str = "ghcn"
    license: str = (
        "Public domain (NOAA / NCEI). Recommended citation: "
        "Menne, M.J., I. Durre, R.S. Vose, B.E. Gleason, T.G. Houston, "
        "2012: An overview of the Global Historical Climatology Network-Daily "
        "Database. Journal of Atmospheric and Oceanic Technology, 29, 897-910."
    )
    citation: str = (
        "Menne et al. 2012, Global Historical Climatology Network-Daily "
        "(NOAA NCEI)."
    )

    # ---- catalog -----------------------------------------------------------

    def fetch_catalog(self, cache_dir: Path, *, refresh: bool = False) -> dict[str, Path]:
        """Download station + inventory files. Returns {name: path}."""
        cache_dir.mkdir(parents=True, exist_ok=True)
        stations = cache_dir / "ghcnd-stations.txt"
        inventory = cache_dir / "ghcnd-inventory.txt"

        if refresh or not stations.exists():
            log.info("ghcn.catalog.fetch", file="stations", url=STATIONS_URL)
            _download(STATIONS_URL, stations)
        else:
            log.info("ghcn.catalog.cached", file="stations", path=str(stations))

        if refresh or not inventory.exists():
            log.info("ghcn.catalog.fetch", file="inventory", url=INVENTORY_URL)
            _download(INVENTORY_URL, inventory)
        else:
            log.info("ghcn.catalog.cached", file="inventory", path=str(inventory))

        return {"stations": stations, "inventory": inventory}

    # ---- per-station data --------------------------------------------------

    def fetch_station_dly(
        self,
        *,
        station_id: str,
        cache_dir: Path,
        refresh: bool = False,
    ) -> dict[str, str | int]:
        """Download one station's .dly file. Returns {path, bytes, checksum}.

        Stations missing from the archive surface as `FileNotFoundError`;
        the caller (pipeline) decides whether to skip or re-resolve.
        """
        cache_dir.mkdir(parents=True, exist_ok=True)
        out = cache_dir / f"{station_id}.dly"
        if not refresh and out.exists():
            log.info("ghcn.dly.cached", station_id=station_id, path=str(out))
        else:
            url = STATION_DLY_FMT.format(station_id=station_id)
            log.info("ghcn.dly.fetch", station_id=station_id, url=url)
            try:
                _download(url, out)
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    raise FileNotFoundError(
                        f"GHCN station not in /all archive: {station_id}"
                    ) from e
                raise

        size = out.stat().st_size
        digest = _sha256_of_file(out)
        log.info(
            "ghcn.dly.ready",
            station_id=station_id, bytes=size, checksum=digest,
        )
        return {"path": str(out), "bytes": size, "checksum": digest}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _download(url: str, out: Path, *, timeout_s: int = 90, retries: int = 3) -> None:
    """Download with simple backoff; writes atomically (.part → rename)."""
    last: Exception | None = None
    tmp = out.with_suffix(out.suffix + ".part")
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "klimate-kundli/0.2 (ghcn ingest)"},
            )
            with urllib.request.urlopen(req, timeout=timeout_s) as resp, tmp.open("wb") as f:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            tmp.replace(out)
            return
        except urllib.error.HTTPError as e:
            if e.code == 404 or e.code < 500 and e.code not in (429,):
                raise
            last = e
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
        backoff = min(2 ** attempt * 5, 60)
        log.warning(
            "ghcn.download.retry",
            url=url, attempt=attempt + 1, error=str(last), sleep_s=backoff,
        )
        time.sleep(backoff)
    raise RuntimeError(f"GHCN download failed after {retries + 1} attempts: {last}")


def _sha256_of_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

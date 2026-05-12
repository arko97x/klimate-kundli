"""Environment + source configuration for ingest workers."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


# Load .env from the v0.2 root if present. Workers are expected to be invoked
# from the v0.2 directory (e.g. `cd v0.2 && klimate-ingest worker ...`); we
# fall back to the repo root and the user's CWD too.
_loaded = False


def load_env() -> None:
    global _loaded
    if _loaded:
        return
    cwd = Path.cwd()
    candidates = [cwd / ".env", cwd.parent / ".env", cwd / "infra" / ".env"]
    for p in candidates:
        if p.exists():
            load_dotenv(p)
            break
    _loaded = True


@dataclass(frozen=True)
class SupabaseConfig:
    db_url: str

    @classmethod
    def from_env(cls) -> "SupabaseConfig":
        load_env()
        url = os.environ.get("SUPABASE_DB_URL")
        if not url:
            raise RuntimeError(
                "SUPABASE_DB_URL is not set. Copy v0.2/infra/.env.example to .env "
                "and fill in your Supabase Postgres connection string."
            )
        return cls(db_url=url)


@dataclass(frozen=True)
class R2Config:
    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket: str
    endpoint: str

    @classmethod
    def from_env(cls) -> "R2Config":
        load_env()
        missing = [
            k
            for k in (
                "R2_ACCOUNT_ID",
                "R2_ACCESS_KEY_ID",
                "R2_SECRET_ACCESS_KEY",
                "R2_BUCKET",
                "R2_ENDPOINT",
            )
            if not os.environ.get(k)
        ]
        if missing:
            raise RuntimeError(f"Missing R2 env vars: {', '.join(missing)}")
        return cls(
            account_id=os.environ["R2_ACCOUNT_ID"],
            access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            bucket=os.environ["R2_BUCKET"],
            endpoint=os.environ["R2_ENDPOINT"],
        )


@dataclass(frozen=True)
class CdsConfig:
    url: str
    key: str

    @classmethod
    def from_env(cls) -> "CdsConfig":
        load_env()
        url = os.environ.get("CDSAPI_URL", "https://cds.climate.copernicus.eu/api")
        key = os.environ.get("CDSAPI_KEY")
        if not key:
            raise RuntimeError(
                "CDSAPI_KEY is not set. Either export it or write ~/.cdsapirc per "
                "the CDS user guide."
            )
        return cls(url=url, key=key)


# Pilot ingest settings. Edit here when scaling to production.
PILOT_PLACES_CSV = Path(__file__).resolve().parents[3] / "data" / "places" / "pilot.csv"
PILOT_YEAR_START = 1990
PILOT_YEAR_END = 2024

# Source priority defines which source wins for a given (place, variable).
# Lower = higher priority. Used by the aggregate builder when multiple
# sources are available.
SOURCE_PRIORITY: dict[str, int] = {
    "ghcn":      5,        # global station obs; gold standard where a station exists (phase 7)
    "imd_rain": 10,        # India-only: best for rainfall over India (0.25°, 1901+)
    "imd_temp": 15,        # India-only: best for tmax/tmin over India (1.0°, 1951+)
    "era5land": 20,        # global, higher land resolution, 1950+ (CDS-direct)
    "era5":     30,        # global, full atmosphere, 1940+ (CDS-direct)
    "open_meteo": 50,      # ERA5 archive via Open-Meteo HTTP API — universal floor, 1940+
    "20crv3":   80,        # global, 1836+, lower confidence
}

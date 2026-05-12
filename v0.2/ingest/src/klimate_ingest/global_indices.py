"""Phase 4.5 — load curated + fetched global indices into Supabase.

Powers kundli cells:

  cell 8  country_emissions   per-country annual + cumulative CO2 (Mt)
  cell 10 global_indices      indicator='gmsl_mm'  (global mean sea level)
  cell 11 global_indices      indicator='co2_ppm'  (Mauna Loa annual mean)
  cell 12 country_projections per-country 2050 ΔT and Δprecip

Three of the four datasets ship as curated CSVs in `v0.2/data/global/`.
The country emissions file is too large to hand-author (33 countries × 100+
years) so we fetch the OWID/Global Carbon Budget master CSV at load time,
filter to the pilot country set, and cache a slimmed copy alongside the
others. Every load writes one row to `source_provenance` so the serving
API can show lineage.

Idempotent: re-running upserts on the natural keys. Safe to run after
adding a new pilot country (subsequent fetch will pick it up).
"""

from __future__ import annotations

import csv
import hashlib
import io
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .db import transaction
from .logging import get_logger

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Default location for the curated CSVs. Resolved relative to the ingest
# package root so the same path works from the venv or from the source tree.
DATA_DIR_DEFAULT = Path(__file__).resolve().parents[3] / "data" / "global"

# Upstream master CSV for country emissions. Mirrors the Global Carbon
# Budget annual release; OWID re-issues it on a slow cadence so a single
# pin is fine for an exhibition piece. Keep the URL stable: when we move to
# a versioned snapshot, update both this and the `source_version` stamp.
OWID_CO2_URL = "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv"

# alpha-3 (OWID) → alpha-2 (places.country_code) for the pilot set. Kept
# inline so the loader has zero non-stdlib dependencies; a wider rollout
# would replace this with `pycountry`.
ALPHA3_TO_ALPHA2 = {
    "ARE": "AE", "ARG": "AR", "AUS": "AU", "BGD": "BD", "BRA": "BR",
    "CAN": "CA", "CHN": "CN", "DEU": "DE", "EGY": "EG", "ESP": "ES",
    "FRA": "FR", "GBR": "GB", "HKG": "HK", "IDN": "ID", "IND": "IN",
    "ITA": "IT", "JPN": "JP", "KEN": "KE", "LKA": "LK", "MEX": "MX",
    "NGA": "NG", "NLD": "NL", "NPL": "NP", "NZL": "NZ", "PHL": "PH",
    "PAK": "PK", "RUS": "RU", "SWE": "SE", "SGP": "SG", "THA": "TH",
    "TUR": "TR", "USA": "US", "ZAF": "ZA",
}

# Default minimum year — most exhibition visitors are 1940+ births. Pulling
# earlier years bloats the table without helping any cell.
MIN_YEAR_DEFAULT = 1900


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LoadSummary:
    co2_ppm_rows: int = 0
    gmsl_rows: int = 0
    emissions_rows: int = 0
    projection_rows: int = 0
    countries_covered: int = 0
    provenance_ids: tuple[int, ...] = ()

    def as_dict(self) -> dict[str, object]:
        return {
            "co2_ppm_rows": self.co2_ppm_rows,
            "gmsl_rows": self.gmsl_rows,
            "country_emissions_rows": self.emissions_rows,
            "country_projection_rows": self.projection_rows,
            "countries_covered": self.countries_covered,
            "provenance_ids": list(self.provenance_ids),
        }


def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _sha256_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            block = f.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _parse_float(s: str | None) -> float | None:
    if s is None or s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_int(s: str | None) -> int | None:
    if s is None or s == "":
        return None
    try:
        return int(s)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Provenance helper — one ledger row per dataset loaded.
# ---------------------------------------------------------------------------

def _write_provenance(
    cur,                       # psycopg cursor (autocommitted by caller)
    *,
    source: str,
    source_version: str | None,
    variable: str,
    date_start: str,
    date_end: str,
    storage_uri: str,
    bytes_: int | None,
    checksum: str | None,
    license_: str | None,
    citation: str | None,
    notes: str | None = None,
) -> int:
    cur.execute(
        """
        INSERT INTO source_provenance
          (source, source_version, variable, date_start, date_end,
           area_bbox, fetched_at, license, citation, storage_uri, bytes,
           checksum, notes)
        VALUES (%s, %s, %s, %s, %s, NULL, now(), %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            source, source_version, variable, date_start, date_end,
            license_, citation, storage_uri, bytes_, checksum, notes,
        ),
    )
    return int(cur.fetchone()["id"])


# ---------------------------------------------------------------------------
# Loader 1 — Mauna Loa CO2 ppm  (cell 11)
# ---------------------------------------------------------------------------

def load_co2_ppm(data_dir: Path = DATA_DIR_DEFAULT) -> tuple[int, int]:
    csv_path = data_dir / "co2_annmean_mlo.csv"
    rows = _read_csv(csv_path)
    bytes_ = csv_path.stat().st_size
    checksum = _sha256_file(csv_path)
    log.info("global.co2_ppm.load.start", rows=len(rows), file=str(csv_path))

    written = 0
    with transaction() as conn, conn.cursor() as cur:
        for r in rows:
            y = _parse_int(r["year"])
            v = _parse_float(r["co2_ppm"])
            if y is None or v is None:
                continue
            cur.execute(
                """
                INSERT INTO global_indices
                  (indicator, year, value, source, source_version, quality, notes)
                VALUES ('co2_ppm', %s, %s, 'noaa_gml_mlo', %s, 5,
                        'Mauna Loa annual mean, Scripps + NOAA GML')
                ON CONFLICT (indicator, year) DO UPDATE SET
                  value = EXCLUDED.value,
                  source = EXCLUDED.source,
                  source_version = EXCLUDED.source_version,
                  quality = EXCLUDED.quality,
                  notes = EXCLUDED.notes
                """,
                (y, v, f"klimate-kundli-curated-{csv_path.stat().st_mtime:.0f}"),
            )
            written += cur.rowcount

        prov_id = _write_provenance(
            cur,
            source="noaa_gml_mlo",
            source_version=None,
            variable="co2_ppm_annual",
            date_start=f"{min(int(r['year']) for r in rows)}-01-01",
            date_end=f"{max(int(r['year']) for r in rows)}-12-31",
            storage_uri=f"file://{csv_path}",
            bytes_=bytes_,
            checksum=checksum,
            license_="CC0/public domain (NOAA)",
            citation="Lan, X., Tans, P. and Thoning, K.W. (2024) Trends in globally-averaged CO2. NOAA/GML.",
            notes="Mauna Loa annual mean CO2 (ppm), curated CSV.",
        )
    log.info("global.co2_ppm.load.done", upserted=written, provenance_id=prov_id)
    return written, prov_id


# ---------------------------------------------------------------------------
# Loader 2 — Global mean sea level  (cell 10)
# ---------------------------------------------------------------------------

def load_gmsl(data_dir: Path = DATA_DIR_DEFAULT) -> tuple[int, int]:
    csv_path = data_dir / "gmsl_annual.csv"
    rows = _read_csv(csv_path)
    bytes_ = csv_path.stat().st_size
    checksum = _sha256_file(csv_path)
    log.info("global.gmsl.load.start", rows=len(rows), file=str(csv_path))

    written = 0
    with transaction() as conn, conn.cursor() as cur:
        for r in rows:
            y = _parse_int(r["year"])
            v = _parse_float(r["gmsl_mm"])
            if y is None or v is None:
                continue
            cur.execute(
                """
                INSERT INTO global_indices
                  (indicator, year, value, source, source_version, quality, notes)
                VALUES ('gmsl_mm', %s, %s, 'csiro_nasa_gmsl', %s, 4,
                        'Church & White 1880-1992 tide gauges + NASA satellite 1993+')
                ON CONFLICT (indicator, year) DO UPDATE SET
                  value = EXCLUDED.value,
                  source = EXCLUDED.source,
                  source_version = EXCLUDED.source_version,
                  quality = EXCLUDED.quality,
                  notes = EXCLUDED.notes
                """,
                (y, v, f"klimate-kundli-curated-{csv_path.stat().st_mtime:.0f}"),
            )
            written += cur.rowcount

        prov_id = _write_provenance(
            cur,
            source="csiro_nasa_gmsl",
            source_version=None,
            variable="gmsl_mm_annual",
            date_start=f"{min(int(r['year']) for r in rows)}-01-01",
            date_end=f"{max(int(r['year']) for r in rows)}-12-31",
            storage_uri=f"file://{csv_path}",
            bytes_=bytes_,
            checksum=checksum,
            license_="CC-BY (CSIRO) + public domain (NASA)",
            citation=(
                "Church, J.A. and N.J. White (2011), Sea-level rise from "
                "the late 19th to the early 21st century, Surveys in Geophysics, "
                "32, 585-602. NASA/CNES satellite altimetry: TOPEX, Jason-1/2/3."
            ),
            notes="Annual global mean sea level (mm above 1880 baseline), curated CSV.",
        )
    log.info("global.gmsl.load.done", upserted=written, provenance_id=prov_id)
    return written, prov_id


# ---------------------------------------------------------------------------
# Loader 3 — country annual emissions  (cell 8)
# ---------------------------------------------------------------------------

def _fetch_owid_csv(cache_path: Path) -> tuple[bytes, str]:
    """Fetch OWID CO2 master CSV. If cached and fresh enough, reuse."""
    if cache_path.exists():
        b = cache_path.read_bytes()
        return b, _sha256_bytes(b)
    log.info("owid.fetch.start", url=OWID_CO2_URL)
    req = urllib.request.Request(
        OWID_CO2_URL, headers={"User-Agent": "klimate-kundli-v0.2"}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        b = resp.read()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(b)
    log.info("owid.fetch.done", bytes=len(b), cache=str(cache_path))
    return b, _sha256_bytes(b)


def load_country_emissions(
    data_dir: Path = DATA_DIR_DEFAULT,
    *,
    min_year: int = MIN_YEAR_DEFAULT,
    refresh: bool = False,
) -> tuple[int, int, int]:
    cache_path = data_dir / ".cache" / "owid-co2-data.csv"
    slim_path = data_dir / "country_co2.csv"
    if refresh and cache_path.exists():
        cache_path.unlink()

    raw_bytes, checksum = _fetch_owid_csv(cache_path)

    # Slim to pilot countries + relevant columns, write the cached slim copy.
    reader = csv.DictReader(io.StringIO(raw_bytes.decode("utf-8")))
    pilot_alpha3 = set(ALPHA3_TO_ALPHA2)
    slimmed: list[tuple[str, int, float | None, float | None]] = []
    for r in reader:
        iso3 = (r.get("iso_code") or "").strip()
        if iso3 not in pilot_alpha3:
            continue
        y = _parse_int(r.get("year"))
        if y is None or y < min_year:
            continue
        co2_mt = _parse_float(r.get("co2"))            # OWID 'co2' is Mt CO2/yr
        co2_pc = _parse_float(r.get("co2_per_capita"))  # t CO2/person/yr
        if co2_mt is None and co2_pc is None:
            continue
        slimmed.append((ALPHA3_TO_ALPHA2[iso3], y, co2_mt, co2_pc))

    slim_path.parent.mkdir(parents=True, exist_ok=True)
    with slim_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["country_code", "year", "co2_mt", "co2_per_capita"])
        for row in slimmed:
            w.writerow([row[0], row[1],
                        "" if row[2] is None else row[2],
                        "" if row[3] is None else row[3]])

    log.info(
        "global.emissions.slim",
        upstream_bytes=len(raw_bytes),
        slim_rows=len(slimmed),
        slim_file=str(slim_path),
    )

    written = 0
    countries_covered: set[str] = set()
    with transaction() as conn, conn.cursor() as cur:
        for cc, y, co2_mt, co2_pc in slimmed:
            cur.execute(
                """
                INSERT INTO country_emissions
                  (country_code, year, co2_mt, co2_per_capita, source, source_version, quality)
                VALUES (%s, %s, %s, %s, 'owid_gcb', %s, 4)
                ON CONFLICT (country_code, year) DO UPDATE SET
                  co2_mt = EXCLUDED.co2_mt,
                  co2_per_capita = EXCLUDED.co2_per_capita,
                  source = EXCLUDED.source,
                  source_version = EXCLUDED.source_version,
                  quality = EXCLUDED.quality
                """,
                (cc, y, co2_mt, co2_pc, f"owid-{checksum[:12]}"),
            )
            written += cur.rowcount
            countries_covered.add(cc)

        date_start = f"{min((y for _, y, *_ in slimmed), default=min_year)}-01-01"
        date_end = f"{max((y for _, y, *_ in slimmed), default=min_year)}-12-31"
        prov_id = _write_provenance(
            cur,
            source="owid_gcb",
            source_version=f"owid-{checksum[:12]}",
            variable="annual_co2_emissions",
            date_start=date_start,
            date_end=date_end,
            storage_uri=OWID_CO2_URL,
            bytes_=len(raw_bytes),
            checksum=checksum,
            license_="CC-BY 4.0 (Our World in Data)",
            citation=(
                "Hannah Ritchie, Pablo Rosado, Max Roser (2024), "
                "Our World in Data CO2 dataset, based on the Global Carbon Project (Global Carbon Budget)."
            ),
            notes=(
                f"Slimmed to pilot countries ({len(pilot_alpha3)}). "
                f"Cached at {slim_path}. min_year={min_year}."
            ),
        )

    log.info(
        "global.emissions.load.done",
        upserted=written,
        countries=len(countries_covered),
        provenance_id=prov_id,
    )
    return written, len(countries_covered), prov_id


# ---------------------------------------------------------------------------
# Loader 4 — country 2050 projections  (cell 12)
# ---------------------------------------------------------------------------

def load_country_projections(
    data_dir: Path = DATA_DIR_DEFAULT,
) -> tuple[int, int]:
    csv_path = data_dir / "country_projection_2050.csv"
    rows = _read_csv(csv_path)
    bytes_ = csv_path.stat().st_size
    checksum = _sha256_file(csv_path)
    log.info("global.projection.load.start", rows=len(rows), file=str(csv_path))

    written = 0
    with transaction() as conn, conn.cursor() as cur:
        for r in rows:
            cc = r["country_code"].strip().upper()
            scenario = r["scenario"].strip().lower()
            horizon = _parse_int(r["horizon"])
            baseline_start = _parse_int(r["baseline_start"])
            baseline_end = _parse_int(r["baseline_end"])
            dt_c = _parse_float(r["dt_c"])
            dprecip_pct = _parse_float(r["dprecip_pct"])
            if not cc or not scenario or horizon is None:
                continue
            cur.execute(
                """
                INSERT INTO country_projections
                  (country_code, scenario, horizon, baseline_start, baseline_end,
                   dt_c, dprecip_pct, source, source_version, quality, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'ipcc_ar6_atlas', %s, 3, %s)
                ON CONFLICT (country_code, scenario, horizon) DO UPDATE SET
                  baseline_start = EXCLUDED.baseline_start,
                  baseline_end = EXCLUDED.baseline_end,
                  dt_c = EXCLUDED.dt_c,
                  dprecip_pct = EXCLUDED.dprecip_pct,
                  source = EXCLUDED.source,
                  source_version = EXCLUDED.source_version,
                  quality = EXCLUDED.quality,
                  notes = EXCLUDED.notes
                """,
                (
                    cc, scenario, horizon, baseline_start, baseline_end,
                    dt_c, dprecip_pct,
                    f"klimate-kundli-curated-{csv_path.stat().st_mtime:.0f}",
                    (r.get("notes") or "").strip() or None,
                ),
            )
            written += cur.rowcount

        prov_id = _write_provenance(
            cur,
            source="ipcc_ar6_atlas",
            source_version=None,
            variable="country_projection_2050",
            date_start=f"{rows[0]['baseline_start']}-01-01",
            date_end=f"{rows[0]['horizon']}-12-31",
            storage_uri=f"file://{csv_path}",
            bytes_=bytes_,
            checksum=checksum,
            license_="CC-BY-NC-ND 4.0 (IPCC AR6 Atlas figures); curated subset",
            citation=(
                "IPCC, 2021: Climate Change 2021: The Physical Science Basis. "
                "Working Group I Interactive Atlas, regional summaries "
                "(2041-2060 vs 1995-2014)."
            ),
            notes="Per-country mid-range ΔT (°C) and Δprecip (%) for SSP2-4.5 and SSP5-8.5.",
        )
    log.info(
        "global.projection.load.done", upserted=written, provenance_id=prov_id
    )
    return written, prov_id


# ---------------------------------------------------------------------------
# Top-level entry — load all four datasets in one pass.
# ---------------------------------------------------------------------------

def load_all(
    data_dir: Path = DATA_DIR_DEFAULT,
    *,
    refresh_owid: bool = False,
    min_year: int = MIN_YEAR_DEFAULT,
) -> LoadSummary:
    ppm_rows, ppm_prov = load_co2_ppm(data_dir)
    gmsl_rows, gmsl_prov = load_gmsl(data_dir)
    em_rows, em_countries, em_prov = load_country_emissions(
        data_dir, min_year=min_year, refresh=refresh_owid,
    )
    proj_rows, proj_prov = load_country_projections(data_dir)
    return LoadSummary(
        co2_ppm_rows=ppm_rows,
        gmsl_rows=gmsl_rows,
        emissions_rows=em_rows,
        projection_rows=proj_rows,
        countries_covered=em_countries,
        provenance_ids=(ppm_prov, gmsl_prov, em_prov, proj_prov),
    )

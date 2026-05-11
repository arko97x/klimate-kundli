"""Place-gazetteer loader. Reads pilot CSV → upserts into Supabase."""

from __future__ import annotations

import csv
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .db import transaction
from .logging import get_logger

log = get_logger(__name__)


@dataclass
class PlaceRow:
    slug: str
    name: str
    country_code: str
    country: str
    admin1: str | None
    lat: float
    lon: float
    population: int | None
    tier: int
    aliases: list[str]


def _strip_diacritics(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def read_csv(path: Path) -> list[PlaceRow]:
    rows: list[PlaceRow] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            slug = raw["slug"].strip()
            if not slug:
                continue
            aliases_raw = (raw.get("aliases") or "").strip()
            aliases = [a.strip() for a in aliases_raw.split(",") if a.strip()]
            rows.append(
                PlaceRow(
                    slug=slug,
                    name=raw["name"].strip(),
                    country_code=raw["country_code"].strip().upper(),
                    country=raw["country"].strip(),
                    admin1=(raw.get("admin1") or "").strip() or None,
                    lat=float(raw["lat"]),
                    lon=float(raw["lon"]),
                    population=int(raw["population"]) if raw.get("population") else None,
                    tier=int(raw.get("tier") or 1),
                    aliases=aliases,
                )
            )
    return rows


def _expand_aliases(p: PlaceRow) -> list[str]:
    """Auto-add a diacritic-stripped alias when the name has accents."""
    out = list(p.aliases)
    plain = _strip_diacritics(p.name)
    if plain != p.name and plain not in out:
        out.append(plain)
    return out


def upsert(rows: Iterable[PlaceRow]) -> dict[str, int]:
    inserted = 0
    aliases_inserted = 0
    with transaction() as conn, conn.cursor() as cur:
        for p in rows:
            cur.execute(
                """
                INSERT INTO places
                  (slug, name, country_code, country, admin1, lat, lon, population, tier, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (slug) DO UPDATE SET
                  name = EXCLUDED.name,
                  country_code = EXCLUDED.country_code,
                  country = EXCLUDED.country,
                  admin1 = EXCLUDED.admin1,
                  lat = EXCLUDED.lat,
                  lon = EXCLUDED.lon,
                  population = EXCLUDED.population,
                  tier = EXCLUDED.tier,
                  updated_at = now()
                RETURNING id
                """,
                (
                    p.slug,
                    p.name,
                    p.country_code,
                    p.country,
                    p.admin1,
                    p.lat,
                    p.lon,
                    p.population,
                    p.tier,
                ),
            )
            place_id = cur.fetchone()["id"]  # type: ignore[index]
            inserted += 1
            for alias in _expand_aliases(p):
                cur.execute(
                    """
                    INSERT INTO place_aliases (place_id, alias, source)
                    VALUES (%s, %s, 'manual')
                    ON CONFLICT (place_id, alias) DO NOTHING
                    """,
                    (place_id, alias),
                )
                if cur.rowcount:
                    aliases_inserted += 1
    log.info("places.upsert.done", places=inserted, aliases=aliases_inserted)
    return {"places": inserted, "aliases": aliases_inserted}

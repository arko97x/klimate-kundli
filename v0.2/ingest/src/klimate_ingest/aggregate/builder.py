"""Set-based aggregate builders driven off `daily_weather`.

Design notes:

* All builders are pure SQL on the serving DB. Pandas isn't worth it for
  rows in the low tens-of-thousands; Postgres is fine and avoids a
  round-trip.
* Every builder UPSERTs into its target so partial reruns (after adding
  more daily data) stay idempotent. The PK on each aggregate table
  excludes `source`, so we filter to a single source per build pass to
  avoid conflicting writes from era5 vs ghcn for the same (place, year).
* `decade_rain` is derived from `annual_rain` rather than `daily_weather`
  so the decade math respects the same `valid_days` filter we apply at
  the annual level.
* `monthly_normals` defaults to the WMO 1991–2020 baseline if those
  years are present; otherwise it picks the widest contiguous range of
  fully-populated years available. This keeps a single-year dev build
  (e.g. just 2020) from silently producing a bogus 30-year normal.
* `season_prefix` writes one row per (place_id, date, season). The
  primary key tolerates running it across many seasons/years.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import psycopg

from ..db import transaction
from ..logging import get_logger

log = get_logger(__name__)


# Minimum days required in a year for it to count toward annual rollups.
# ERA5 reanalysis has no gaps inside a year, but station data does.
MIN_DAYS_PER_YEAR_TEMP = 300
MIN_DAYS_PER_YEAR_RAIN = 300

# Minimum years required inside a decade for the decade row to be written.
MIN_YEARS_PER_DECADE = 3

# Default WMO baseline window; overridden if daily_weather doesn't cover it.
DEFAULT_BASELINE_START = 1991
DEFAULT_BASELINE_END = 2020


@dataclass(frozen=True)
class BuildResult:
    annual_extremes: int = 0
    annual_rain: int = 0
    decade_rain: int = 0
    monthly_normals: int = 0
    season_prefix: int = 0
    baseline_start: int | None = None
    baseline_end: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "annual_extremes": self.annual_extremes,
            "annual_rain": self.annual_rain,
            "decade_rain": self.decade_rain,
            "monthly_normals": self.monthly_normals,
            "season_prefix": self.season_prefix,
            "baseline_start": self.baseline_start,
            "baseline_end": self.baseline_end,
        }


# ---------------------------------------------------------------------------
# annual_extremes
# ---------------------------------------------------------------------------


_SQL_ANNUAL_EXTREMES = """
WITH per_year AS (
  SELECT place_id, source,
         EXTRACT(YEAR FROM date)::int AS year,
         date, tmax_c, tmin_c
    FROM daily_weather
   WHERE source = %(source)s
),
hi AS (
  SELECT DISTINCT ON (place_id, year)
         place_id, year, source, tmax_c AS max_temp_c, date AS max_temp_date
    FROM per_year
   WHERE tmax_c IS NOT NULL
   ORDER BY place_id, year, tmax_c DESC, date
),
lo AS (
  SELECT DISTINCT ON (place_id, year)
         place_id, year, source, tmin_c AS min_temp_c, date AS min_temp_date
    FROM per_year
   WHERE tmin_c IS NOT NULL
   ORDER BY place_id, year, tmin_c ASC, date
),
valid AS (
  SELECT place_id, year, source,
         COUNT(*) FILTER (WHERE tmax_c IS NOT NULL AND tmin_c IS NOT NULL) AS valid_days
    FROM per_year
   GROUP BY place_id, year, source
)
INSERT INTO annual_extremes (
  place_id, year, max_temp_c, max_temp_date, min_temp_c, min_temp_date,
  valid_days, source, source_version, quality
)
SELECT v.place_id, v.year,
       hi.max_temp_c, hi.max_temp_date,
       lo.min_temp_c, lo.min_temp_date,
       v.valid_days, v.source, NULL, %(quality)s
  FROM valid v
  JOIN hi USING (place_id, year, source)
  JOIN lo USING (place_id, year, source)
 WHERE v.valid_days >= %(min_days)s
ON CONFLICT (place_id, year, source) DO UPDATE SET
  max_temp_c     = EXCLUDED.max_temp_c,
  max_temp_date  = EXCLUDED.max_temp_date,
  min_temp_c     = EXCLUDED.min_temp_c,
  min_temp_date  = EXCLUDED.min_temp_date,
  valid_days     = EXCLUDED.valid_days,
  source_version = EXCLUDED.source_version,
  quality        = EXCLUDED.quality
"""


def build_annual_extremes(*, source: str, quality: int = 3, min_days: int = MIN_DAYS_PER_YEAR_TEMP) -> int:
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(_SQL_ANNUAL_EXTREMES, {"source": source, "quality": quality, "min_days": min_days})
        n = cur.rowcount
    log.info("aggregate.annual_extremes", source=source, rows=n, min_days=min_days)
    return n


# ---------------------------------------------------------------------------
# annual_rain
# ---------------------------------------------------------------------------


_SQL_ANNUAL_RAIN = """
INSERT INTO annual_rain (
  place_id, year, rain_mm, valid_days, source, source_version, quality
)
SELECT place_id,
       EXTRACT(YEAR FROM date)::int AS year,
       SUM(precip_mm) AS rain_mm,
       COUNT(*) FILTER (WHERE precip_mm IS NOT NULL) AS valid_days,
       source,
       NULL,
       %(quality)s
  FROM daily_weather
 WHERE source = %(source)s
   AND precip_mm IS NOT NULL
 GROUP BY place_id, EXTRACT(YEAR FROM date), source
HAVING COUNT(*) FILTER (WHERE precip_mm IS NOT NULL) >= %(min_days)s
ON CONFLICT (place_id, year, source) DO UPDATE SET
  rain_mm        = EXCLUDED.rain_mm,
  valid_days     = EXCLUDED.valid_days,
  source_version = EXCLUDED.source_version,
  quality        = EXCLUDED.quality
"""


def build_annual_rain(*, source: str, quality: int = 3, min_days: int = MIN_DAYS_PER_YEAR_RAIN) -> int:
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(_SQL_ANNUAL_RAIN, {"source": source, "quality": quality, "min_days": min_days})
        n = cur.rowcount
    log.info("aggregate.annual_rain", source=source, rows=n, min_days=min_days)
    return n


# ---------------------------------------------------------------------------
# decade_rain  (derived from annual_rain)
# ---------------------------------------------------------------------------


_SQL_DECADE_RAIN = """
INSERT INTO decade_rain (
  place_id, decade_start, avg_annual_rain_mm, years_used,
  source, source_version, quality
)
SELECT place_id,
       (FLOOR(year / 10) * 10)::int AS decade_start,
       AVG(rain_mm)::real AS avg_annual_rain_mm,
       COUNT(*)::int AS years_used,
       source,
       NULL,
       %(quality)s
  FROM annual_rain
 WHERE source = %(source)s
 GROUP BY place_id, (FLOOR(year / 10) * 10), source
HAVING COUNT(*) >= %(min_years)s
ON CONFLICT (place_id, decade_start, source) DO UPDATE SET
  avg_annual_rain_mm = EXCLUDED.avg_annual_rain_mm,
  years_used         = EXCLUDED.years_used,
  source_version     = EXCLUDED.source_version,
  quality            = EXCLUDED.quality
"""


def build_decade_rain(
    *,
    source: str,
    quality: int = 3,
    min_years: int = MIN_YEARS_PER_DECADE,
) -> int:
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(_SQL_DECADE_RAIN, {"source": source, "quality": quality, "min_years": min_years})
        n = cur.rowcount
    log.info("aggregate.decade_rain", source=source, rows=n, min_years=min_years)
    return n


# ---------------------------------------------------------------------------
# monthly_normals
# ---------------------------------------------------------------------------


_SQL_MONTHLY_NORMALS = """
INSERT INTO monthly_normals (
  place_id, month, tmax_avg_c, tmin_avg_c, rain_avg_mm,
  baseline_start, baseline_end, source, source_version, quality
)
SELECT place_id,
       EXTRACT(MONTH FROM date)::smallint AS month,
       AVG(tmax_c)::real    AS tmax_avg_c,
       AVG(tmin_c)::real    AS tmin_avg_c,
       AVG(precip_mm)::real AS rain_avg_mm,
       %(b_start)s, %(b_end)s,
       source, NULL, %(quality)s
  FROM daily_weather
 WHERE source = %(source)s
   AND EXTRACT(YEAR FROM date) BETWEEN %(b_start)s AND %(b_end)s
 GROUP BY place_id, EXTRACT(MONTH FROM date), source
ON CONFLICT (place_id, month, baseline_start, baseline_end, source) DO UPDATE SET
  tmax_avg_c     = EXCLUDED.tmax_avg_c,
  tmin_avg_c     = EXCLUDED.tmin_avg_c,
  rain_avg_mm    = EXCLUDED.rain_avg_mm,
  source_version = EXCLUDED.source_version,
  quality        = EXCLUDED.quality
"""


def build_monthly_normals(
    *,
    source: str,
    baseline_start: int,
    baseline_end: int,
    quality: int = 3,
) -> int:
    if baseline_end < baseline_start:
        raise ValueError("baseline_end must be >= baseline_start")
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            _SQL_MONTHLY_NORMALS,
            {
                "source": source,
                "b_start": baseline_start,
                "b_end": baseline_end,
                "quality": quality,
            },
        )
        n = cur.rowcount
    log.info(
        "aggregate.monthly_normals",
        source=source,
        baseline_start=baseline_start,
        baseline_end=baseline_end,
        rows=n,
    )
    return n


def detect_baseline(*, source: str, preferred: tuple[int, int] = (DEFAULT_BASELINE_START, DEFAULT_BASELINE_END)) -> tuple[int, int]:
    """Pick a baseline window that's actually populated in `daily_weather`.

    Returns the WMO 1991–2020 window if every year in it has data,
    otherwise widens to the full min..max year of `source`. Returns
    (-1, -1) when there's no data at all.
    """
    p_start, p_end = preferred
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              MIN(EXTRACT(YEAR FROM date))::int AS y_min,
              MAX(EXTRACT(YEAR FROM date))::int AS y_max,
              COUNT(DISTINCT EXTRACT(YEAR FROM date))::int AS n_years,
              COUNT(DISTINCT CASE
                WHEN EXTRACT(YEAR FROM date) BETWEEN %(ps)s AND %(pe)s
                THEN EXTRACT(YEAR FROM date) END)::int AS n_in_window
              FROM daily_weather
             WHERE source = %(source)s
            """,
            {"source": source, "ps": p_start, "pe": p_end},
        )
        row = cur.fetchone()
    if not row or row["y_min"] is None:
        return (-1, -1)
    expected_in_window = p_end - p_start + 1
    if row["n_in_window"] >= expected_in_window:
        return (p_start, p_end)
    return (int(row["y_min"]), int(row["y_max"]))


# ---------------------------------------------------------------------------
# season_prefix
# ---------------------------------------------------------------------------
#
# season_prefix stores per-date cumulative sums per (place, season). A
# range query then becomes:
#
#     end   = SELECT ... WHERE date <= range_end   AND season = ?
#     start = SELECT ... WHERE date <  range_start AND season = ?
#     avg   = (end.tmax_cum - start.tmax_cum) / (end.count_cum - start.count_cum)
#
# The seasons follow the Indian summer/winter split used in v0.1:
# summer = Apr..Sep, winter = Oct..Mar. Hemisphere-specific seasons can
# replace this later without a schema change.

_SQL_SEASON_PREFIX = """
WITH tagged AS (
  SELECT place_id, date, source, tmax_c, tmin_c,
         CASE WHEN EXTRACT(MONTH FROM date) BETWEEN 4 AND 9
              THEN 'summer' ELSE 'winter' END AS season
    FROM daily_weather
   WHERE source = %(source)s
     AND (tmax_c IS NOT NULL OR tmin_c IS NOT NULL)
),
rolled AS (
  SELECT
    place_id, date, source, season,
    SUM(COALESCE(tmax_c, 0)) OVER w AS tmax_cum,
    SUM(COALESCE(tmin_c, 0)) OVER w AS tmin_cum,
    SUM(CASE WHEN tmax_c IS NOT NULL AND tmin_c IS NOT NULL THEN 1 ELSE 0 END) OVER w AS count_cum
  FROM tagged
  WINDOW w AS (PARTITION BY place_id, season ORDER BY date
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
)
INSERT INTO season_prefix (place_id, date, season, tmax_cum, tmin_cum, count_cum, source)
SELECT place_id, date, season, tmax_cum, tmin_cum, count_cum, source
  FROM rolled
ON CONFLICT (place_id, date, season, source) DO UPDATE SET
  tmax_cum  = EXCLUDED.tmax_cum,
  tmin_cum  = EXCLUDED.tmin_cum,
  count_cum = EXCLUDED.count_cum
"""


def build_season_prefix(*, source: str) -> int:
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(_SQL_SEASON_PREFIX, {"source": source})
        n = cur.rowcount
    log.info("aggregate.season_prefix", source=source, rows=n)
    return n


# ---------------------------------------------------------------------------
# build_all
# ---------------------------------------------------------------------------


def build_all(
    *,
    source: str,
    baseline_start: int | None = None,
    baseline_end: int | None = None,
    quality: int = 3,
) -> BuildResult:
    """Run every builder in dependency order. Returns row counts touched."""
    if baseline_start is None or baseline_end is None:
        b_start, b_end = detect_baseline(source=source)
        if b_start == -1:
            log.warning("aggregate.build_all.no_data", source=source)
            return BuildResult()
        baseline_start = baseline_start or b_start
        baseline_end = baseline_end or b_end

    ae = build_annual_extremes(source=source, quality=quality)
    ar = build_annual_rain(source=source, quality=quality)
    dr = build_decade_rain(source=source, quality=quality)
    mn = build_monthly_normals(
        source=source,
        baseline_start=baseline_start,
        baseline_end=baseline_end,
        quality=quality,
    )
    sp = build_season_prefix(source=source)
    return BuildResult(
        annual_extremes=ae,
        annual_rain=ar,
        decade_rain=dr,
        monthly_normals=mn,
        season_prefix=sp,
        baseline_start=baseline_start,
        baseline_end=baseline_end,
    )


# ---------------------------------------------------------------------------
# psycopg type registration
# ---------------------------------------------------------------------------
#
# psycopg returns dict rows because db.connect() uses dict_row. detect_baseline
# above relies on that. No extra registration needed; this comment exists so
# future contributors don't try to "fix" the row indexing.
_ = psycopg

"""Aggregate builders. Roll `daily_weather` up into the serving tables.

Each builder is an idempotent SQL upsert. Re-running them rebuilds rows
for whatever range of dates is now present in `daily_weather`. They are
deliberately set-based (one big INSERT … SELECT) so adding more daily
rows and re-running is cheap relative to row-by-row Python.
"""

from .builder import (
    BuildResult,
    build_all,
    build_annual_extremes,
    build_annual_rain,
    build_decade_rain,
    build_monthly_normals,
    build_season_prefix,
    detect_baseline,
)

__all__ = [
    "BuildResult",
    "build_all",
    "build_annual_extremes",
    "build_annual_rain",
    "build_decade_rain",
    "build_monthly_normals",
    "build_season_prefix",
    "detect_baseline",
]

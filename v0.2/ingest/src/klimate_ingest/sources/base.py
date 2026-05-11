"""Source connector interface."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class FetchResult:
    """One downloaded chunk and its provenance."""

    storage_uri: str            # e.g. local path or s3://… target
    bytes: int
    checksum: str               # sha256 hex digest
    notes: str = ""


class Source(Protocol):
    """A climate data source.

    Implementations download a single (variable, year, month, area) chunk to
    local scratch and return a `FetchResult` so the worker can upload it to
    R2 and stamp `source_provenance` + `ingest_jobs`.
    """

    name: str
    license: str

    def fetch_chunk(
        self,
        *,
        variable: str,
        year: int,
        month: int | None,
        area_bbox: dict[str, float],
        scratch_dir: Path,
    ) -> FetchResult: ...

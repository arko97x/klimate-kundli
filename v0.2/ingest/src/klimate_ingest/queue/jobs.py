"""CRUD helpers for the ingest_jobs table."""

from __future__ import annotations

import json
import socket
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from ..db import transaction


DEFAULT_LEASE_MINUTES = 30


@dataclass(frozen=True)
class Job:
    id: int
    source: str
    variable: str
    year: int
    month: int | None
    area_bbox: dict[str, float]
    status: str
    attempts: int
    max_attempts: int

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "Job":
        return cls(
            id=row["id"],
            source=row["source"],
            variable=row["variable"],
            year=row["year"],
            month=row["month"],
            area_bbox=row["area_bbox"],
            status=row["status"],
            attempts=row["attempts"],
            max_attempts=row["max_attempts"],
        )


def _worker_id() -> str:
    return f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}"


def enqueue(
    source: str,
    variable: str,
    year: int,
    area_bbox: dict[str, float],
    *,
    month: int | None = None,
    max_attempts: int = 5,
) -> int:
    """Insert a pending job. Idempotent on (source, variable, year, month)."""
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ingest_jobs (source, variable, year, month, area_bbox, max_attempts)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s)
            ON CONFLICT (source, variable, year, month) DO UPDATE
              SET area_bbox = EXCLUDED.area_bbox,
                  max_attempts = EXCLUDED.max_attempts
            RETURNING id
            """,
            (source, variable, year, month, json.dumps(area_bbox), max_attempts),
        )
        return cur.fetchone()["id"]  # type: ignore[index]


def claim_one(source: str | None = None, lease_minutes: int = DEFAULT_LEASE_MINUTES) -> Job | None:
    """
    Atomically claim the next runnable job.

    Picks the oldest job that's:
      - status = 'pending', OR
      - status = 'running' but lease expired, OR
      - status = 'failed' and retry_at has passed and attempts < max_attempts.

    Filters by source if provided. Marks the row 'running' and stamps a fresh
    lease + worker_id. SKIP LOCKED keeps multiple workers from grabbing the
    same row.
    """
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            WITH next_job AS (
              SELECT id
              FROM ingest_jobs
              WHERE (%(source)s IS NULL OR source = %(source)s)
                AND attempts < max_attempts
                AND (
                     status = 'pending'
                  OR (status = 'running' AND (lease_until IS NULL OR lease_until < now()))
                  OR (status = 'failed'  AND (retry_at   IS NULL OR retry_at   < now()))
                )
              ORDER BY created_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            UPDATE ingest_jobs j
               SET status      = 'running',
                   attempts    = j.attempts + 1,
                   lease_until = now() + make_interval(mins => %(lease_min)s),
                   worker_id   = %(worker_id)s,
                   error       = NULL
              FROM next_job
             WHERE j.id = next_job.id
         RETURNING j.*
            """,
            {
                "source": source,
                "lease_min": lease_minutes,
                "worker_id": _worker_id(),
            },
        )
        row = cur.fetchone()
        return Job.from_row(row) if row else None


def mark_done(
    job_id: int,
    *,
    rows_written: int | None = None,
    bytes_: int | None = None,
    checksum: str | None = None,
    storage_uri: str | None = None,
) -> None:
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE ingest_jobs
               SET status       = 'done',
                   rows_written = %s,
                   bytes        = %s,
                   checksum     = %s,
                   storage_uri  = %s,
                   error        = NULL,
                   lease_until  = NULL
             WHERE id = %s
            """,
            (rows_written, bytes_, checksum, storage_uri, job_id),
        )


def mark_failed(job_id: int, error: str, *, retry_in_seconds: int | None = None) -> None:
    """
    Mark a job failed. If `retry_in_seconds` is set, it stays eligible for
    re-claim after that delay (subject to max_attempts). Otherwise it stays
    failed and won't be retried automatically.
    """
    retry_at = (
        datetime.now(timezone.utc) + timedelta(seconds=retry_in_seconds)
        if retry_in_seconds is not None
        else None
    )
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE ingest_jobs
               SET status      = 'failed',
                   error       = %s,
                   retry_at    = %s,
                   lease_until = NULL
             WHERE id = %s
            """,
            (error, retry_at, job_id),
        )


def status_summary(source: str | None = None) -> dict[str, int]:
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT status, COUNT(*) AS n
              FROM ingest_jobs
             WHERE (%s IS NULL OR source = %s)
             GROUP BY status
            """,
            (source, source),
        )
        return {r["status"]: int(r["n"]) for r in cur.fetchall()}

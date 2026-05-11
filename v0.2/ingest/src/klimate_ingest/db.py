"""Postgres connection helper for Supabase reads/writes."""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .config import SupabaseConfig


def connect() -> psycopg.Connection[dict[str, Any]]:
    cfg = SupabaseConfig.from_env()
    # autocommit=False is the default; callers manage transactions explicitly.
    return psycopg.connect(cfg.db_url, row_factory=dict_row, autocommit=False)


@contextlib.contextmanager
def transaction() -> Iterator[psycopg.Connection[dict[str, Any]]]:
    """Context-managed connection that commits on success, rolls back on error."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

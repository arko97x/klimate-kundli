"""Structured logging setup. Workers log JSON in production, pretty in dev."""

from __future__ import annotations

import logging
import os
import sys

import structlog


def configure(level: str | int | None = None) -> None:
    lvl = level if level is not None else os.environ.get("LOG_LEVEL", "INFO")
    if isinstance(lvl, str):
        lvl = getattr(logging, lvl.upper(), logging.INFO)

    pretty = sys.stderr.isatty() and os.environ.get("LOG_FORMAT", "auto") != "json"

    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    if pretty:
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(lvl),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    configure()
    return structlog.get_logger(name)

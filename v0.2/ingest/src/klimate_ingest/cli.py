"""Skeleton CLI. Real subcommands land in subsequent passes."""

from __future__ import annotations

import click


@click.group(help="Klimate Kundli v0.2 ingest CLI (skeleton).")
def main() -> None:
    pass


@main.command(help="Print the configured sources and target coverage.")
def plan() -> None:
    click.echo("plan: not implemented yet (skeleton).")


@main.command(help="Run the ingest worker for a specific source.")
@click.option("--source", required=True, help="era5 | era5land | imd | ghcn")
def worker(source: str) -> None:
    click.echo(f"worker: source={source} — not implemented yet (skeleton).")


@main.command(help="Build aggregate serving tables from processed data.")
@click.option("--target", default="supabase", help="supabase | local")
def aggregate(target: str) -> None:
    click.echo(f"aggregate: target={target} — not implemented yet (skeleton).")


if __name__ == "__main__":
    main()

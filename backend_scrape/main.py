from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Callable

import pandas as pd
import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.live import Live
from rich.table import Table
from supabase import create_client

package_dir = Path(__file__).resolve().parent
parent_dir = str(package_dir.parent)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from backend_scrape.dedup import deduplicate_records
from backend_scrape.models import ATSRecord
from backend_scrape.scrapers import capterra, g2, github_md, seed
from backend_scrape.url_patterns import enrich_with_patterns

app = typer.Typer(help="Scrape and compile ATS platforms from multiple sources.")
console = Console()

SourceFunc = Callable[[bool], "asyncio.Future[list[ATSRecord]]"]


@app.callback()
def _cli() -> None:
    """ATS scraper command group."""


def _build_progress_table(statuses: dict[str, dict[str, str | int]]) -> Table:
    table = Table(title="ATS Scrape Progress")
    table.add_column("Source")
    table.add_column("Fetched", justify="right")
    table.add_column("Status")
    table.add_column("Notes")

    for source_name in sorted(statuses):
        row = statuses[source_name]
        table.add_row(
            source_name,
            str(row.get("count", 0)),
            str(row.get("status", "pending")),
            str(row.get("note", "")),
        )

    return table


async def _run_scrapers(selected_sources: list[str], verbose: bool) -> dict[str, list[ATSRecord]]:
    source_map: dict[str, SourceFunc] = {
        "g2": g2.scrape,
        "capterra": capterra.scrape,
        "github": github_md.scrape,
        "seed": seed.scrape,
    }

    statuses: dict[str, dict[str, str | int]] = {
        source: {"status": "pending", "count": 0, "note": ""}
        for source in selected_sources
    }
    results: dict[str, list[ATSRecord]] = {source: [] for source in selected_sources}

    async def run_one(source_name: str) -> None:
        statuses[source_name]["status"] = "running"
        try:
            records = await source_map[source_name](verbose=verbose)
            results[source_name] = records
            statuses[source_name]["count"] = len(records)
            statuses[source_name]["status"] = "done"
        except Exception as exc:  # noqa: BLE001
            statuses[source_name]["status"] = "error"
            statuses[source_name]["note"] = str(exc)
            if verbose:
                console.print(f"[red]{source_name} failed:[/red] {exc}")

    tasks = [asyncio.create_task(run_one(source)) for source in selected_sources]

    with Live(_build_progress_table(statuses), console=console, refresh_per_second=4) as live:
        while True:
            if all(task.done() for task in tasks):
                break
            live.update(_build_progress_table(statuses))
            await asyncio.sleep(0.25)
        await asyncio.gather(*tasks, return_exceptions=True)
        live.update(_build_progress_table(statuses))

    return results


def _parse_csv_list(value: str) -> list[str]:
    return [item.strip().lower() for item in value.split(",") if item.strip()]


def _export_records(records: list[ATSRecord], output_prefix: Path, formats: list[str]) -> None:
    output_prefix.parent.mkdir(parents=True, exist_ok=True)
    rows = [record.to_dict() for record in records]

    if "json" in formats:
        json_path = output_prefix.with_suffix(".json")
        with json_path.open("w", encoding="utf-8") as fp:
            json.dump(rows, fp, indent=2)
        console.print(f"[green]Wrote[/green] {json_path}")

    if "csv" in formats:
        csv_path = output_prefix.with_suffix(".csv")
        pd.DataFrame(rows).to_csv(csv_path, index=False)
        console.print(f"[green]Wrote[/green] {csv_path}")


def _chunked(items: list[dict], chunk_size: int) -> list[list[dict]]:
    return [items[idx : idx + chunk_size] for idx in range(0, len(items), chunk_size)]


def _sync_supabase(records: list[ATSRecord]) -> tuple[int, int]:
    load_dotenv()
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY in environment")

    client = create_client(supabase_url, supabase_key)
    rows: list[dict] = []
    for record in records:
        row = record.to_dict()
        row["sources"] = row.pop("source")
        rows.append(row)

    inserted = 0
    updated = 0

    for chunk in _chunked(rows, 50):
        names = [row["name"] for row in chunk if row.get("name")]
        existing_resp = client.table("ats_platforms").select("name").in_("name", names).execute()
        existing_names = {row["name"] for row in (existing_resp.data or []) if "name" in row}

        client.table("ats_platforms").upsert(chunk, on_conflict="name").execute()

        updated += sum(1 for name in names if name in existing_names)
        inserted += sum(1 for name in names if name not in existing_names)

    return inserted, updated


@app.command()
def run(
    sources: str = typer.Option("g2,capterra,github,seed", help="Comma-separated sources."),
    output: str = typer.Option("./ats_database", help="Output path prefix without extension."),
    format: str = typer.Option("csv,json", help="Comma-separated output formats."),
    verbose: bool = typer.Option(False, "--verbose", help="Verbose logs."),
    supabase: bool = typer.Option(False, "--supabase", help="Sync records to Supabase after export."),
    dry_run: bool = typer.Option(False, "--dry-run", help="Scrape and deduplicate but skip all writes."),
) -> None:
    selected_sources = _parse_csv_list(sources)
    selected_formats = _parse_csv_list(format)

    supported_sources = {"g2", "capterra", "github", "seed"}
    invalid_sources = [s for s in selected_sources if s not in supported_sources]
    if invalid_sources:
        raise typer.BadParameter(f"Unsupported source(s): {', '.join(invalid_sources)}")

    supported_formats = {"csv", "json"}
    invalid_formats = [f for f in selected_formats if f not in supported_formats]
    if invalid_formats:
        raise typer.BadParameter(f"Unsupported format(s): {', '.join(invalid_formats)}")

    scraped_by_source = asyncio.run(_run_scrapers(selected_sources, verbose=verbose))

    all_records: list[ATSRecord] = []
    for records in scraped_by_source.values():
        all_records.extend(records)

    deduped = deduplicate_records(all_records)
    enrich_with_patterns(deduped)

    source_counts = Counter()
    tier_counts = Counter()
    for record in deduped:
        for src in record.source:
            source_counts[src] += 1
        tier_counts[record.tier] += 1

    console.print("\n[bold]Summary[/bold]")
    console.print(f"Total unique ATS found: [cyan]{len(deduped)}[/cyan]")
    console.print(f"Breakdown by source: {dict(source_counts)}")
    console.print(f"Breakdown by tier: {dict(tier_counts)}")

    if dry_run:
        console.print("[yellow]Dry run enabled: skipping all writes (local files and Supabase).[/yellow]")
        return

    _export_records(deduped, Path(output), selected_formats)

    if supabase:
        inserted, updated = _sync_supabase(deduped)
        console.print(f"[green]{inserted} records inserted, {updated} records updated[/green]")


if __name__ == "__main__":
    app()

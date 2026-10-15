#!/usr/bin/env python3
"""Fetch nflverse weekly player statistics; fail closed on unknown schemas.

Source: nflverse-data GitHub release tag player_stats. Uses Python stdlib only.
Outputs an atomic, bounded cache for roster players with verified GSIS IDs.
"""
import csv
import io
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from player_crosswalk import build_crosswalk, join_direct_gsis, combine_verified

API = "https://api.github.com/repos/nflverse/nflverse-data/releases/tags/stats_player"
OUT = Path("data/historical-weekly.json")
SNAPSHOTS = ["imperial", "qb-controversy", "jersey", "tri-state"]
FIELDS = {"player_id", "season", "week", "season_type", "passing_yards",
          "passing_tds", "interceptions", "carries", "rushing_yards",
          "rushing_tds", "receptions", "receiving_yards", "receiving_tds"}
STATS = sorted(FIELDS - {"player_id", "season", "week", "season_type"})

def read_url(url, limit=80_000_000):
    request = Request(url, headers={"User-Agent": "DynastyHQ/0.1 (historical stats refresh)",
                                    "Accept": "application/vnd.github+json"})
    with urlopen(request, timeout=90) as response:
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("Upstream response exceeds safe size limit")
    return raw

def select_asset(release, season):
    assets = release.get("assets", [])
    expected = f"stats_player_week_{season}.csv"
    matches = [a for a in assets if a.get("name") == expected]
    if len(matches) != 1:
        raise ValueError(f"Expected {expected} in current nflverse stats_player release")
    return matches[0]["browser_download_url"]


def validate_rows(text, season, ids):
    reader = csv.DictReader(io.StringIO(text))
    required = FIELDS - {"interceptions"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames) or not ({"interceptions", "passing_interceptions"} & set(reader.fieldnames)):
        raise ValueError("Unexpected nflverse weekly stats schema")
    output = {}
    seen = set()
    for row in reader:
        if row["season_type"] != "REG" or row["player_id"] not in ids:
            continue
        try:
            year, week = int(row["season"]), int(row["week"])
        except (ValueError, TypeError):
            raise ValueError("Invalid season or week")
        if year not in (season, season - 1) or not 1 <= week <= 18:
            continue
        key = (row["player_id"], year, week)
        if key in seen:
            raise ValueError("Duplicate player week in source")
        seen.add(key)
        stats = {}
        for field in STATS:
            try:
                raw = row.get("passing_interceptions") if field == "interceptions" and "interceptions" not in row else row[field]
                value = float(raw or 0)
            except (ValueError, TypeError):
                raise ValueError("Non-numeric stat: " + field)
            if not -1000 <= value <= 1000:
                raise ValueError("Out-of-range stat: " + field)
            stats[field] = value
        output.setdefault(row["player_id"], []).append({
            "season": year, "week": week, "season_type": "REG", **stats
        })
    return output

def main():
    season = int(os.environ.get("NFL_SEASON", "2026"))
    # Never use name matching. Only explicit GSIS IDs from Sleeper's player DB.
    sleeper = json.loads(read_url("https://api.sleeper.app/v1/players/nfl"))
    ids = set()
    sleeper_ids_by_key = {}
    for sleeper_id, player in sleeper.items():
        if player.get("gsis_id") and player.get("position") in ("QB", "RB", "WR", "TE"):
            ids.add(str(player["gsis_id"]))
            sleeper_ids_by_key[str(player["gsis_id"])] = str(sleeper_id)
    if not ids:
        raise ValueError("Sleeper returned no GSIS player IDs")
    release = json.loads(read_url(API))
    source = select_asset(release, season)
    csv_text = read_url(source).decode("utf-8-sig")
    # Diagnostic summary contains counts and schema only; no large player database logs.
    reader = csv.DictReader(io.StringIO(csv_text))
    fields = reader.fieldnames or []
    source_ids = set()
    years = {}
    for row in reader:
        if row.get("season_type") != "REG":
            continue
        year = row.get("season", "")
        years[year] = years.get(year, 0) + 1
        if year in (str(season), str(season - 1)) and row.get("player_id"):
            source_ids.add(row["player_id"])
    matched_ids = ids & source_ids
    # Report player coverage by Sleeper's position, rather than assuming every
    # GSIS ID represents an active fantasy-relevant 2026 player.
    by_position = {}
    for player in sleeper.values():
        position = player.get("position")
        gsis = str(player.get("gsis_id") or "")
        if position not in ("QB", "RB", "WR", "TE") or not gsis:
            continue
        bucket = by_position.setdefault(position, {"sleeper": 0, "matched": 0})
        bucket["sleeper"] += 1
        bucket["matched"] += int(gsis in source_ids)
    print("Position coverage:", by_position, flush=True)
    print("Source ID overlap with Sleeper metadata:", len(matched_ids),
          "Source IDs not in Sleeper:", len(source_ids - ids), flush=True)
    source_sample = sorted(source_ids)[:8]
    sleeper_sample = sorted(ids)[:8]
    # Safe diagnostic: aggregate counts and short opaque ID samples only.
    print("ID format samples: Sleeper=", sleeper_sample,
          "nflverse=", source_sample,
          "nflverse IDs with GSIS prefix=", sum(x.startswith("00-") for x in source_ids),
          "Sleeper IDs with GSIS prefix=", sum(x.startswith("00-") for x in ids),
          flush=True)
    print("nflverse diagnostics: Sleeper GSIS IDs=", len(ids),
          "nflverse recent-season player IDs=", len(source_ids),
          "overlapping IDs=", len(matched_ids),
          "season row counts=", dict(sorted(years.items())[-4:]),
          "source columns=", fields, flush=True)
    direct = join_direct_gsis(sleeper, source_ids)
    crosswalk_url = os.environ.get("VERIFIED_CROSSWALK_CSV_URL", "").strip()
    external = {}
    if crosswalk_url:
        if not crosswalk_url.startswith("https://"):
            raise ValueError("Crosswalk source must use HTTPS")
        external = build_crosswalk(read_url(crosswalk_url).decode("utf-8-sig"),
                                   sleeper, source_ids)
    verified = combine_verified(direct, external)
    print("Verified identity coverage: direct=", len(direct),
          "external=", len(external), "combined=", len(verified), flush=True)
    rows = validate_rows(csv_text, season, set(verified.values()))
    if len(verified) < 100 or len(rows) < 100:
        raise ValueError(
            f"Too few verified player IDs: {len(verified)} (required >=100); "
            f"Sleeper GSIS IDs={len(ids)}, nflverse recent IDs={len(source_ids)}, "
            f"intersection={len(matched_ids)}; refusing incomplete cache")
    from datetime import datetime, timezone
    by_sleeper = {sid: rows[gsis] for sid, gsis in verified.items() if gsis in rows}
    payload = {"generated_at": datetime.now(timezone.utc).isoformat(),
               "season": season, "source": source,
               "identity_source": "Verified Sleeper GSIS and optional structured crosswalk (no name joins)",
               "players": by_sleeper}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUT.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    temp.replace(OUT)
    print(f"Verified {len(rows)} player identities; wrote {OUT}")

if __name__ == "__main__":
    main()

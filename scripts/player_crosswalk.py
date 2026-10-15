"""Validated ID joins between Sleeper GSIS IDs and nflverse player IDs.

nflverse weekly player_id is typically a GSIS ID, but a mapping can only
be accepted from a structured external crosswalk containing both identifiers.
Names are never used for matching.
"""
import csv
import io

def build_crosswalk(csv_text, sleeper, nflverse_ids):
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames or not {"gsis_id", "sleeper_id"}.issubset(reader.fieldnames):
        raise ValueError("Crosswalk must include gsis_id and sleeper_id")
    reverse = {}
    sleeper_to_gsis = {}
    conflicts = set()
    for row in reader:
        gsis = (row.get("gsis_id") or "").strip()
        sid = (row.get("sleeper_id") or "").strip()
        if not gsis or not sid or gsis not in nflverse_ids:
            continue
        player = sleeper.get(sid)
        if not player or player.get("position") not in ("QB", "RB", "WR", "TE"):
            continue
        # Sleeper's own GSIS assignment, when present, must not contradict.
        existing = str(player.get("gsis_id") or "")
        if existing and existing != gsis:
            conflicts.add(sid)
            continue
        if sid in sleeper_to_gsis and sleeper_to_gsis[sid] != gsis:
            conflicts.add(sid)
            continue
        if gsis in reverse and reverse[gsis] != sid:
            conflicts.add(sid)
            conflicts.add(reverse[gsis])
            continue
        sleeper_to_gsis[sid] = gsis
        reverse[gsis] = sid
    if conflicts:
        raise ValueError("Conflicting crosswalk identities: " + str(len(conflicts)))
    return sleeper_to_gsis

def join_direct_gsis(sleeper, nflverse_ids):
    result = {}
    used = set()
    for sid, player in sleeper.items():
        if player.get("position") not in ("QB", "RB", "WR", "TE"):
            continue
        gsis = str(player.get("gsis_id") or "")
        if not gsis or gsis not in nflverse_ids:
            continue
        if gsis in used:
            raise ValueError("Duplicate Sleeper GSIS identity")
        used.add(gsis)
        result[str(sid)] = gsis
    return result

def combine_verified(direct, external):
    result = dict(direct)
    reverse = {gsis: sid for sid, gsis in result.items()}
    for sid, gsis in external.items():
        if sid in result and result[sid] != gsis:
            raise ValueError("External crosswalk contradicts Sleeper GSIS")
        if gsis in reverse and reverse[gsis] != sid:
            raise ValueError("GSIS identity belongs to multiple Sleeper players")
        result[sid] = gsis
        reverse[gsis] = sid
    return result

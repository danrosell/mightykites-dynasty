"""Explicit Sleeper/nflverse identity matching; never join by player name."""
import csv
import io
from collections import Counter

NULL_IDS = {"", "NA", "NULL", "NONE", "NAN"}

def normalize_id(value):
    """Trim surrounding whitespace only; never rewrite meaningful ID characters."""
    result = str(value or "").strip()
    return "" if result.upper() in NULL_IDS else result

def build_crosswalk(csv_text, sleeper, nflverse_ids):
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames or not {"gsis_id", "sleeper_id"}.issubset(reader.fieldnames):
        raise ValueError("Crosswalk must include gsis_id and sleeper_id")
    reverse = {}
    sleeper_to_gsis = {}
    categories = Counter()
    examples = {}
    def record(category, sid):
        categories[category] += 1
        examples.setdefault(category, [])
        if len(examples[category]) < 3:
            examples[category].append(sid)
    for row in reader:
        raw_gsis, raw_sid = row.get("gsis_id"), row.get("sleeper_id")
        gsis, sid = normalize_id(raw_gsis), normalize_id(raw_sid)
        if not gsis or not sid:
            categories["missing_identity"] += 1
            continue
        if gsis not in nflverse_ids:
            categories["not_in_nflverse"] += 1
            continue
        player = sleeper.get(sid)
        if not player or player.get("position") not in ("QB", "RB", "WR", "TE"):
            categories["not_eligible_sleeper"] += 1
            continue
        existing = normalize_id(player.get("gsis_id"))
        if existing and existing != gsis:
            record("sleeper_gsis_mismatch", sid)
            continue
        if sid in sleeper_to_gsis and sleeper_to_gsis[sid] != gsis:
            record("sleeper_id_multiple_gsis", sid)
            continue
        if gsis in reverse and reverse[gsis] != sid:
            record("gsis_multiple_sleeper_ids", sid)
            continue
        if str(raw_gsis or "") != gsis or str(raw_sid or "") != sid or str(player.get("gsis_id") or "") != existing:
            categories["normalized_whitespace"] += 1
        if sid in sleeper_to_gsis:
            categories["duplicate_same_identity"] += 1
        sleeper_to_gsis[sid] = gsis
        reverse[gsis] = sid
    print("Crosswalk diagnostic categories:", dict(sorted(categories.items())), flush=True)
    for category in ("sleeper_gsis_mismatch", "sleeper_id_multiple_gsis", "gsis_multiple_sleeper_ids"):
        if category in examples:
            print("Crosswalk conflict samples", category, examples[category], flush=True)
    conflicts = sum(categories[k] for k in ("sleeper_gsis_mismatch", "sleeper_id_multiple_gsis", "gsis_multiple_sleeper_ids"))
    if conflicts:
        raise ValueError(f"Conflicting crosswalk identities: {conflicts}; categories={dict(sorted(categories.items()))}")
    return sleeper_to_gsis

def join_direct_gsis(sleeper, nflverse_ids):
    result = {}
    used = set()
    for sid, player in sleeper.items():
        if player.get("position") not in ("QB", "RB", "WR", "TE"):
            continue
        gsis = normalize_id(player.get("gsis_id"))
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

from __future__ import annotations

import re
from collections import defaultdict

from rapidfuzz import fuzz

from .models import ATSRecord


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower()).strip()


def deduplicate_records(records: list[ATSRecord], fuzzy_threshold: int = 92) -> list[ATSRecord]:
    exact: dict[str, ATSRecord] = {}
    for record in records:
        key = normalize_name(record.name)
        if not key:
            continue
        if key not in exact:
            exact[key] = ATSRecord(**record.to_dict())
        else:
            exact[key].merge_from(record)

    keys = list(exact.keys())
    if len(keys) < 2:
        return list(exact.values())

    parent = list(range(len(keys)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        pi = find(i)
        pj = find(j)
        if pi != pj:
            parent[pj] = pi

    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            score = fuzz.ratio(keys[i], keys[j])
            if score >= fuzzy_threshold:
                union(i, j)

    groups: dict[int, list[ATSRecord]] = defaultdict(list)
    for idx, key in enumerate(keys):
        groups[find(idx)].append(exact[key])

    merged: list[ATSRecord] = []
    for items in groups.values():
        canonical = ATSRecord(**items[0].to_dict())
        for item in items[1:]:
            canonical.merge_from(item)
        merged.append(canonical)

    merged.sort(key=lambda x: x.name.lower())
    return merged

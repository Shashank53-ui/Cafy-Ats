from __future__ import annotations

from .dedup import normalize_name
from .models import ATSRecord

PATTERN_BY_NAME = {
    "greenhouse": "boards.greenhouse.io",
    "lever": "jobs.lever.co",
    "workday": "myworkdayjobs.com",
    "taleo": "taleo.net",
    "icims": "icims.com/jobs",
    "smartrecruiters": "jobs.smartrecruiters.com",
    "workable": "apply.workable.com",
    "bamboohr": "bamboohr.com/careers",
    "jazzhr": "applytojob.com",
    "ashby": "jobs.ashbyhq.com",
    "breezyhr": "breezy.hr",
    "zohorecruit": "zohorecruit.com/recruit",
    "jobvite": "jobs.jobvite.com",
    "teamtailor": "teamtailor.com/jobs",
    "recruitee": "recruitee.com/o",
    "manatal": "manatal.com",
    "pinpoint": "pinpointhq.com",
    "clearcompany": "clearcompany.com/careers",
    "avature": "avature.net",
    "bullhorn": "bullhorn.com",
    "opencats": "opencats.org",
}

TIER_BY_NAME = {
    "workday": "enterprise",
    "taleo": "enterprise",
    "icims": "enterprise",
    "greenhouse": "mid-market",
    "lever": "mid-market",
    "smartrecruiters": "enterprise",
    "workable": "smb",
    "bamboohr": "smb",
    "jazzhr": "smb",
}


def enrich_with_patterns(records: list[ATSRecord]) -> None:
    for record in records:
        key = normalize_name(record.name)
        if not record.careers_url_pattern and key in PATTERN_BY_NAME:
            record.careers_url_pattern = PATTERN_BY_NAME[key]
        if record.tier == "unknown" and key in TIER_BY_NAME:
            record.tier = TIER_BY_NAME[key]

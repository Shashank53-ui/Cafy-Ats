from __future__ import annotations

from ..models import ATSRecord

SEED_ATS = [
    ("Greenhouse", "https://www.greenhouse.com"),
    ("Lever", "https://www.lever.co"),
    ("Workday", "https://www.workday.com"),
    ("Taleo", "https://www.oracle.com/taleo"),
    ("iCIMS", "https://www.icims.com"),
    ("SmartRecruiters", "https://www.smartrecruiters.com"),
    ("Workable", "https://www.workable.com"),
    ("BambooHR", "https://www.bamboohr.com"),
    ("JazzHR", "https://www.jazzhr.com"),
    ("Ashby", "https://www.ashbyhq.com"),
    ("Breezy HR", "https://breezy.hr"),
    ("Zoho Recruit", "https://www.zoho.com/recruit"),
    ("Jobvite", "https://www.jobvite.com"),
    ("Teamtailor", "https://www.teamtailor.com"),
    ("Recruitee", "https://recruitee.com"),
    ("Manatal", "https://www.manatal.com"),
    ("Pinpoint", "https://www.pinpointhq.com"),
    ("ClearCompany", "https://www.clearcompany.com"),
    ("Gem", "https://www.gem.com"),
    ("Avature", "https://www.avature.net"),
    ("Bullhorn", "https://www.bullhorn.com"),
    ("Vincere", "https://www.vincere.io"),
    ("Loxo", "https://loxo.co"),
    ("PCRecruiter", "https://www.pcrecruiter.net"),
    ("OpenCATS", "https://opencats.org"),
]


async def scrape(verbose: bool = False) -> list[ATSRecord]:
    records = [
        ATSRecord(name=name, website=website, source=["seed"])
        for name, website in SEED_ATS
    ]
    if verbose:
        print(f"[seed] loaded {len(records)} records")
    return records

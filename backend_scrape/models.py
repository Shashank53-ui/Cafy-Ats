from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ATSRecord:
    name: str
    vendor: str | None = None
    website: str | None = None
    careers_url_pattern: str | None = None
    tier: str = "unknown"
    source: list[str] = field(default_factory=list)
    g2_rating: float | None = None
    g2_reviews: int | None = None
    capterra_rating: float | None = None

    def merge_from(self, other: "ATSRecord") -> None:
        if not self.vendor and other.vendor:
            self.vendor = other.vendor
        if not self.website and other.website:
            self.website = other.website
        if not self.careers_url_pattern and other.careers_url_pattern:
            self.careers_url_pattern = other.careers_url_pattern
        if self.tier == "unknown" and other.tier != "unknown":
            self.tier = other.tier

        self.source = list(dict.fromkeys([*self.source, *other.source]))

        if self.g2_rating is None and other.g2_rating is not None:
            self.g2_rating = other.g2_rating
        if self.g2_reviews is None and other.g2_reviews is not None:
            self.g2_reviews = other.g2_reviews
        if self.capterra_rating is None and other.capterra_rating is not None:
            self.capterra_rating = other.capterra_rating

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "vendor": self.vendor,
            "website": self.website,
            "careers_url_pattern": self.careers_url_pattern,
            "tier": self.tier,
            "source": self.source,
            "g2_rating": self.g2_rating,
            "g2_reviews": self.g2_reviews,
            "capterra_rating": self.capterra_rating,
        }

import { NextRequest, NextResponse } from "next/server";

interface CompaniesHouseProfile {
  company_number: string;
  company_name: string;
  date_of_creation: string;
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    region?: string;
    country?: string;
  };
  sic_codes?: string[];
}

function formatAddress(address?: CompaniesHouseProfile["registered_office_address"]): string {
  if (!address) return "";
  const parts = [
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.region,
    address.postal_code,
    address.country,
  ].filter(Boolean);
  return parts.join(", ");
}

async function fetchCompaniesHouseData(
  name: string,
): Promise<{
  registrationNumber: string;
  foundedYear: string;
  registeredAddress: string;
  sicCodes: string[];
} | null> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) return null;

  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  const searchRes = await fetch(
    `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(name)}`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    },
  );

  if (!searchRes.ok) {
    return null;
  }

  const searchJson = await searchRes.json();
  const item = searchJson.items?.[0];
  if (!item?.company_number) return null;

  const profileRes = await fetch(
    `https://api.company-information.service.gov.uk/company/${item.company_number}`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    },
  );

  if (!profileRes.ok) {
    return null;
  }

  const profile = (await profileRes.json()) as CompaniesHouseProfile;

  return {
    registrationNumber: profile.company_number,
    foundedYear: profile.date_of_creation
      ? new Date(profile.date_of_creation).getFullYear().toString()
      : "",
    registeredAddress: formatAddress(profile.registered_office_address),
    sicCodes: profile.sic_codes || [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const { organisationName, townCity, county, typeRating } =
      (await req.json()) as {
        organisationName: string;
        townCity?: string;
        county?: string;
        typeRating?: string;
      };

    if (!organisationName) {
      return NextResponse.json(
        { error: "organisationName is required" },
        { status: 400 },
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured on the server" },
        { status: 500 },
      );
    }

    const chData = await fetchCompaniesHouseData(organisationName);

    const confirmedBlock = chData
      ? `✅ CONFIRMED COMPANIES HOUSE DATA (already verified, use these exact values):
- Registration Number: ${chData.registrationNumber}
- Founded: ${chData.foundedYear}
- Registered Address: ${chData.registeredAddress}
- SIC Codes: ${(chData.sicCodes || []).join(", ")}`
      : "No confirmed Companies House data was found. If you cannot verify a field from official records, use \"Not available\" instead of guessing.";

    const locationText = [townCity, county].filter(Boolean).join(", ") || "the UK";

    const prompt = `You are researching "${organisationName}" in ${locationText}.

${confirmedBlock}

Now research and provide:
1. Employee count / company size.
2. Business description.
3. Official website.
4. Career page URL.
5. APPLICATION GUIDE - 4–5 very specific, actionable steps for how to apply to this company (where, how, documents, timelines, company‑specific tips).
6. VISA SPONSORSHIP INFO - detailed guidance including eligibility, process steps, typical sponsored roles based on their industry and Type & Rating: ${typeRating || "Unknown"}, documents, costs/timelines, and tips.
7. KEY SKILLS: Top 5 skills based on their industry and typical roles.
8. SALARY BREAKDOWN: entry, mid and senior salary bands in GBP (current UK market rates).
9. ACTIVE HIRING ROLES – only use real UK SOC 2020 codes. For each role provide: title, socCode, level ("Higher Skilled" or "Medium Skilled"), sponsorshipEligible (true/false), and skillClassification ("RQF Level 6+" or "RQF Level 3-5").
10. BEST TIME TO APPLY (months/quarters).
11. INTERVIEW TIPS – 3–4 specific, practical tips for this company.

Return ONLY valid JSON with this shape:
{
  "registrationNumber": "string",
  "sicCodes": ["code - description"],
  "registeredAddress": "string",
  "foundedYear": "YYYY or empty string",
  "employees": "e.g. 51-200 employees",
  "description": "company description",
  "website": "https://...",
  "careerPageUrl": "https://...",
  "applicationGuide": "Plain text, numbered points separated by new lines. No markdown.",
  "visaSponsorshipInfo": "Plain text visa guidance with new lines. No markdown.",
  "keySkills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "salaryBreakdown": {
    "entry": "£XX,XXX - £YY,YYY",
    "mid": "£XX,XXX - £YY,YYY",
    "senior": "£XX,XXX - £YY,YYY"
  },
  "activeRoles": [
    {
      "title": "Software Engineer",
      "socCode": "2134",
      "level": "Higher Skilled",
      "sponsorshipEligible": true,
      "skillClassification": "RQF Level 6+"
    }
  ],
  "bestTimeToApply": "e.g. Autumn recruitment cycle",
  "interviewTips": "Plain text tips separated by new lines. No markdown."
}

Use empty strings or empty arrays if some fields cannot be confidently filled from reliable sources. Do not include any markdown or explanatory text outside the JSON.`;

    const systemInstruction =
      "You are a UK company research assistant. Output ONLY valid JSON for the response. No markdown, no code fences, no explanations.";

    // Use current public Gemini API (models like gemini-2.0-flash are supported here).
    // Combine systemInstruction and prompt into a single user message to keep the payload
    // compatible with the current Gemini HTTP API schema.
    const combinedPrompt = `${systemInstruction}\n\n---\n\n${prompt}`;

    const genRes = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(geminiApiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: combinedPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
          },
        }),
      },
    );

    if (!genRes.ok) {
      const text = await genRes.text().catch(() => "");
      console.error("Gemini API error:", genRes.status, text.slice(0, 500));
      return NextResponse.json(
        { error: "Gemini API error" },
        { status: 502 },
      );
    }

    const genJson = (await genRes.json()) as any;
    const rawText =
      genJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    const cleaned = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json(
        { error: "Model did not return JSON" },
        { status: 500 },
      );
    }

    let jsonStr = cleaned.substring(start, end + 1);

    try {
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json(parsed);
    } catch {
      jsonStr = jsonStr.replace(
        /"([^"\\]*(\\.[^"\\]*)*)"/g,
        (match) =>
          match
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t"),
      );
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json(parsed);
    }
  } catch (err) {
    console.error("company-insights route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}


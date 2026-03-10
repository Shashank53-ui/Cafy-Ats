export interface SOCCode {
  code: string;
  name: string;
  related_titles?: string;
  skilled_status: string;
  eligible_phd: string; // "Yes" or "No"
  eligible_isl: string; // "Yes" or "No" (formerly TSL/SOL)
  salary_scale: string; // "Yes" or "No"
  description?: string;
}

// NOTE: This is copied from the original GetLanded-Frontend project.
// It contains the UK SOC 2020 codes metadata used by the Sponsorship Hub.
export const socCodes: SOCCode[] = [
  {
    code: "1111",
    name: "Chief executives and senior officials",
    related_titles:
      "Chairpersons; Chief executives; Diplomats and foreign office officials; Senior public service officials; Chief executives and senior officials not elsewhere classified.",
    skilled_status: "Higher Skilled",
    eligible_phd: "No",
    eligible_isl: "No",
    salary_scale: "No",
  },
  {
    code: "1112",
    name: "Elected officers and representatives",
    related_titles:
      "Assembly members and Members of Parliament; Councillors; Elected officers and representatives not elsewhere classified.",
    skilled_status: "Ineligible",
    eligible_phd: "No",
    eligible_isl: "No",
    salary_scale: "No",
  },
  {
    code: "1121",
    name: "Production managers and directors in manufacturing",
    related_titles: "Production managers and directors in manufacturing",
    skilled_status: "Higher Skilled",
    eligible_phd: "No",
    eligible_isl: "No",
    salary_scale: "No",
  },
  {
    code: "1122",
    name: "Production managers and directors in construction",
    related_titles: "Production managers and directors in construction",
    skilled_status: "Higher Skilled",
    eligible_phd: "No",
    eligible_isl: "No",
    salary_scale: "No",
  },
  {
    code: "1123",
    name: "Production managers and directors in mining and energy",
    related_titles:
      "Managers and directors in the extraction of fossil fuels; Managers and directors in the production of energy; Production managers and directors in mining and energy not elsewhere classified.",
    skilled_status: "Higher Skilled",
    eligible_phd: "No",
    eligible_isl: "No",
    salary_scale: "No",
  },
  // The full SOC 2020 list is long; in your actual project, you should
  // paste the complete array from the original GetLanded-Frontend `socCodes.ts`.
];


export const SMART_ATTACHMENT_MAP: Record<string, { tags: string[]; rationale: string }[]> = {
  not_medically_necessary: [
    { tags: ["therapy_notes"], rationale: "Shows progress and clinical need" },
    { tags: ["provider_letter"], rationale: "Physician statement of medical necessity" },
    { tags: ["iep", "eval_report"], rationale: "Assessment data supporting need" },
  ],
  out_of_network: [
    { tags: ["provider_outreach"], rationale: "Attempts to find in-network providers" },
    { tags: ["single_case_agreement_request"], rationale: "Request for coverage when access is limited" },
  ],
};


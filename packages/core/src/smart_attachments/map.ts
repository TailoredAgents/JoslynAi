export const SMART_ATTACHMENT_MAP: Record<string, { tags: string[]; rationale: string; query: string }[]> = {
  not_medically_necessary: [
    { tags: ["therapy_notes"], rationale: "Shows progress & clinical need", query: "progress notes frequency duration goals medical necessity" },
    { tags: ["provider_letter"], rationale: "Physician medical necessity letter", query: "diagnosis provider letter medical necessity justification" },
    { tags: ["iep", "eval_report"], rationale: "Assessment data supporting need", query: "baseline assessment scores present levels goals" },
  ],
  out_of_network: [
    { tags: ["provider_outreach"], rationale: "Attempts to find in-network providers", query: "attempts to find in-network provider phone call notes outreach dates" },
    { tags: ["single_case_agreement_request"], rationale: "Request for coverage when access is limited", query: "single case agreement request coverage access limited" },
  ],
};

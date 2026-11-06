// Client-safe copy of the report reasons (the server keeps the authoritative enum in trust.ts).
export const REPORT_REASON_OPTIONS = [
  ["payment_demand", "Asks me to pay a fee"],
  ["fake_opportunity", "Fake opportunity"],
  ["fake_organization", "Fake organization"],
  ["suspicious_link", "Suspicious link"],
  ["misleading_compensation", "Misleading compensation"],
  ["discriminatory", "Discriminatory listing"],
  ["harassment", "Harassment"],
  ["spam", "Spam"],
  ["impersonation", "Impersonation"],
  ["other", "Something else"],
] as const;

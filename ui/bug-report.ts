// Link to a prefilled GitHub bug report. Never pass the PR ref: the tracker is public, reviewed PRs often aren't.
export type OsName = "Windows" | "macOS" | "Linux" | "Unknown";

export function osName(userAgent: string): OsName {
  if (userAgent.includes("Windows")) return "Windows";
  if (userAgent.includes("Mac OS X")) return "macOS";
  if (userAgent.includes("Linux")) return "Linux";
  return "Unknown";
}

export function bugReportUrl(version: string, os: OsName): string {
  const params = new URLSearchParams({ template: "bug_report.yml", version, os });
  return `https://github.com/AlsoKnownAs-Ax/bb-plugin-pr-xray/issues/new?${params}`;
}

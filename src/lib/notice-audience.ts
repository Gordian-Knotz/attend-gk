/**
 * Human-readable audience for a notice.
 *
 * Pure, and imports nothing, so it can be tested with `node --test` — the same
 * constraint `tenant-summary.ts` documents. A notice's audience is the thing an
 * admin most needs to be sure of before posting, so it is worth a test rather
 * than a template expression.
 */

const ROLE_PLURAL: Record<string, string> = {
  staff: "staff",
  manager: "managers",
  org_admin: "admins",
  super_admin: "super admins",
};

export function describeAudience(input: {
  siteName: string | null;
  targetRole: string | null;
}): string {
  const { siteName, targetRole } = input;
  // An unknown role is echoed rather than swallowed: a wrong label is better
  // than a confident "Everyone" on a notice that is in fact restricted.
  const role = targetRole ? ROLE_PLURAL[targetRole] ?? targetRole : null;

  if (!siteName && !role) return "Everyone";
  if (!siteName && role) return `All ${role}`;
  if (siteName && !role) return siteName;

  const capitalised = role!.charAt(0).toUpperCase() + role!.slice(1);
  return `${capitalised} at ${siteName}`;
}

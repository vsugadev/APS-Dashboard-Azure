/** Email / APSID helpers — direct ports of Code.gs (normalizeEmail_, isInEmailList_, isSyntacticallyValidEmail_,
 *  isApsEmailAllowed_, extractAPSID_). Behaviour must stay identical; see test/parity.test.ts. */
export function normalizeEmail(email: unknown): string {
  return String(email || '').trim().toLowerCase();
}
export function isInEmailList(email: unknown, list: string[]): boolean {
  const n = normalizeEmail(email);
  if (!n) return false;
  return list.some((e) => normalizeEmail(e) === n);
}
export function isSyntacticallyValidEmail(email: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
export function isApsEmailAllowed(email: unknown, allowedDomains: string[]): boolean {
  if (!isSyntacticallyValidEmail(email)) return false;
  const domain = String(email).trim().toLowerCase().split('@')[1];
  return allowedDomains.indexOf(domain) > -1;
}
export function extractAPSID(email: unknown): string {
  if (!email) return 'NA';
  const m = String(email).match(/_aps([a-z0-9]+)@/i);
  if (!m || !m[1]) return 'NA';
  return ('APS' + m[1]).toUpperCase();
}

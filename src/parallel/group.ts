/** Parallel run (v0.21.0): who may use the Azure dashboard during the test run. No imports from app code (no cycles). */
import type { AppConfig } from '../config';
import { normalizeEmail } from '../lib/email';

export const PR_NOT_IN_GROUP_MSG = 'The new Azure dashboard is in a test run and is open only to the test group. Please keep using the APS Dashboard as usual.';

export function parseParallelUsers(raw: string | undefined): { emails: Set<string>; roles: Set<string> } {
  const emails = new Set<string>(), roles = new Set<string>();
  for (const x of String(raw || '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)) (x.includes('@') ? emails : roles).add(x.includes('@') ? normalizeEmail(x) : x);
  return { emails, roles };
}
/** true when the person may use Azure now (no list = everyone). */
export function inParallelGroup(cfg: AppConfig, email: string, role: string): boolean {
  const g = parseParallelUsers(cfg.parallelRunUsers);
  if (!g.emails.size && !g.roles.size) return true;
  return g.emails.has(normalizeEmail(email)) || g.roles.has(String(role || '').toLowerCase());
}


/** Phase 1 endpoints: session, current user, Access Control table, start-up bundle. Names = Code.gs names. */
import type { Registry } from '../registry';
import { NOT_ON_AZURE } from '../registry';
import { buildUserPayload, requireSession, type AppContext } from '../../app/context';
import { AC_CATALOG, AC_ROLES, AC_ROLE_LABELS, acCellView, acCellValue, acEditableBy, apsTabAllowed, AC_OFF_MSG } from '../../auth/accessControl';
import { isAdminRole } from '../../auth/roles';

const AC_OPEN_ROLES = ['headmaster', 'teacher', 'student', 'vcfo_amchsts_bod', 'authorized'];

function fmtEst(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const s = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  return s.replace(',', '') + ' EST';
}

export function registerCore(reg: Registry): void {
  /** endSession — best-effort sign-out (token removed server-side). */
  reg.register('endSession', async (ctx: AppContext, [token]) => {
    if (typeof token === 'string' && token) await ctx.sessions.remove(token);
    return { ok: true };
  });

  /** getCurrentUser — the signed-in user's payload (role, permissions, tab access) re-read now. */
  reg.register('getCurrentUser', async (ctx, [token]) => {
    const s = await requireSession(ctx, token);
    const courses = await ctx.data.readCourses();
    return buildUserPayload(ctx, { email: s.email, role: s.role }, courses);
  });

  /** getAccessControl — Admin Control → Access Control table (Admin / Super Admin), as Code.gs acTableData_. */
  reg.register('getAccessControl', async (ctx, [token]) => {
    const s = await requireSession(ctx, token);
    if (!isAdminRole(s.role)) throw new Error('Only Admin / Super Admin can use Admin Control.');
    const ov = await ctx.data.readAccessOverrides();
    if (!apsTabAllowed(s.role, 'adminControl.access', ov)) throw new Error(AC_OFF_MSG);
    return {
      roles: AC_ROLES.map((r) => ({ key: r, label: AC_ROLE_LABELS[r] })),
      rows: AC_CATALOG.map((item) => {
        const cells: Record<string, string> = {}, values: Record<string, boolean> = {}, editable: Record<string, boolean> = {};
        for (const r of AC_ROLES) { cells[r] = acCellView(item, r); values[r] = acCellValue(item, r, ov); editable[r] = acEditableBy(item, r, s.role); }
        return { key: item.key, parent: item.parent || '', label: item.label, cells, values, editable };
      }),
      lastSaved: ov.__meta && ov.__meta.at ? { at: fmtEst(ov.__meta.at), by: ov.__meta.by } : null,
      canEdit: false,                 // Phase 1 is read-only: saving stays in Apps Script until Phase 3
      viewerRole: s.role,
      superAll: s.role === 'superadmin',
      openRoles: AC_OPEN_ROLES.slice(),
    };
  });

  /** getStartupBundle — r83 grouped small calls; runs each registered one with its own checks. */
  reg.register('getStartupBundle', async (ctx, [token, names]) => {
    await requireSession(ctx, token);
    if (!Array.isArray(names) || names.length > 20) throw new Error('Bad request.');
    const out: Record<string, { ok?: unknown; err?: string }> = {};
    for (const n of names.map(String)) {
      if (out[n] || n === 'getStartupBundle') continue;
      if (!reg.has(n)) { out[n] = { err: NOT_ON_AZURE + n }; continue; }
      out[n] = await reg.call(ctx, n, [token]);
    }
    return out;
  });
}

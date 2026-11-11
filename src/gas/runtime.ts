/**
 * READ-ONLY Apps Script runtime for the Code.gs reader functions copied into src/gas/scope.generated.ts.
 *
 *  - SpreadsheetApp-like workbooks are SNAPSHOTS of whole sheets read through the Sheets API before the call
 *    (getValues gives the same types Apps Script gives: numbers, strings, booleans, '' for empty, Date for cells
 *    formatted as a date / time — converted in the spreadsheet's own time zone).
 *  - An EXISTING sheet can never be changed (any write throws READ_ONLY). A sheet that does not exist yet behaves as
 *    Code.gs's "create it" path in memory only: it is empty for this request and nothing is written to Google.
 *  - CacheService: nothing cached here (the data source caches whole sheets for 60 s).
 *  - PropertiesService: read-only view of the plain Code.gs settings given to App Service (never secrets);
 *    setProperty / deleteProperty throw.
 */
import { Utilities } from './utilities';
import type { SheetGrid } from '../data/types';

export const READ_ONLY_MSG = 'READ_ONLY: the Azure dashboard does not change Google Sheets yet.';

export class SnapSheet {
  constructor(private name: string, private rows: unknown[][], private readOnly: boolean) {}
  getName(): string { return this.name; }
  getLastRow(): number { let n = 0; this.rows.forEach((r, i) => { if (r && r.some((v) => v !== '' && v !== null && v !== undefined)) n = i + 1; }); return n; }
  getLastColumn(): number { let n = 0; for (const r of this.rows) (r || []).forEach((v, j) => { if (v !== '' && v !== null && v !== undefined && j + 1 > n) n = j + 1; }); return n; }
  getMaxRows(): number { return Math.max(1000, this.rows.length); }
  getMaxColumns(): number { return Math.max(26, ...this.rows.map((r) => (r || []).length)); }
  getDataRange(): SnapRange { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(row: number | string, col = 1, numRows = 1, numCols = 1): SnapRange {
    if (typeof row !== 'number') throw new Error('Azure runtime: A1 ranges are not supported (' + String(row) + ').');
    if (numRows < 1 || numCols < 1) throw new Error('The number of rows in the range must be at least 1.');
    return new SnapRange(this, row, col, numRows, numCols);
  }
  cell(r: number, c: number): unknown { const row = this.rows[r - 1]; const v = row ? row[c - 1] : ''; return v === undefined || v === null ? '' : v; }
  write(r: number, c: number, values: unknown[][]): void {
    if (this.readOnly) throw new Error(READ_ONLY_MSG);
    values.forEach((vr, i) => { const row = (this.rows[r - 1 + i] = this.rows[r - 1 + i] || []); vr.forEach((v, j) => { row[c - 1 + j] = v; }); });
  }
  guard(): this { if (this.readOnly) throw new Error(READ_ONLY_MSG); return this; }
  // formatting / structure calls: allowed only on an in-memory (new) sheet, where they do nothing
  setFrozenRows(): this { return this.guard(); }
  insertColumnsAfter(): this { return this.guard(); }
  appendRow(v: unknown[]): this { this.guard(); this.rows.push(v.slice()); return this; }
  autoResizeColumns(): this { return this.guard(); }
}

export class SnapRange {
  constructor(private sh: SnapSheet, private r: number, private c: number, private nr: number, private nc: number) {}
  getValues(): unknown[][] {
    const out: unknown[][] = [];
    for (let i = 0; i < this.nr; i++) { const row: unknown[] = []; for (let j = 0; j < this.nc; j++) { const v = this.sh.cell(this.r + i, this.c + j); row.push(v instanceof Date ? new Date(v.getTime()) : v); } out.push(row); }
    return out;
  }
  getValue(): unknown { return this.getValues()[0][0]; }
  getDisplayValues(): string[][] { return this.getValues().map((r) => r.map((v) => (v instanceof Date ? v.toISOString() : String(v)))); }
  setValues(v: unknown[][]): this { this.sh.write(this.r, this.c, v); return this; }
  setValue(v: unknown): this { this.sh.write(this.r, this.c, [[v]]); return this; }
  setFontWeight(): this { this.sh.guard(); return this; }
  setNumberFormat(): this { this.sh.guard(); return this; }
}

export class SnapWorkbook {
  private sheets: Record<string, SnapSheet> = {};
  /** `titles` = every sheet that exists in Google. A sheet that exists but was not read into this snapshot throws, so a
   *  reader can never silently see an "empty" sheet; a sheet that does not exist is null (Code.gs "create it" path). */
  constructor(private id: string, grids: Record<string, SheetGrid | null>, private tz = 'America/New_York', private titles: string[] | null = null) {
    for (const [name, g] of Object.entries(grids)) if (g) this.sheets[name] = new SnapSheet(name, g.values.map((r) => r.slice()), true);
  }
  getSheetByName(n: string): SnapSheet | null {
    if (this.sheets[n]) return this.sheets[n];
    if (this.titles && this.titles.indexOf(n) > -1) throw new Error('Azure runtime: sheet "' + n + '" exists but was not read for this request (add it to the snapshot list).');
    return null;
  }
  insertSheet(n: string): SnapSheet { return (this.sheets[n] = new SnapSheet(n, [], false)); } // in memory only — never sent to Google
  getSheets(): SnapSheet[] { return Object.values(this.sheets); }
  getId(): string { return this.id; }
  getSpreadsheetTimeZone(): string { return this.tz; }
}

/** Expected, harmless messages from the copied code (an optional Script Property not set; an audit row Azure does not
 *  write) — not repeated in the App Service log on every request. Never prints a stored value. */
function quiet(m: unknown): boolean { return /^\[Config\] Script Property "[^"]*" is not (set|valid)/.test(String(m)) || /audit not written: READ_ONLY/.test(String(m)); }

const noCache = { get: () => null, put: () => undefined, remove: () => undefined, getAll: () => ({}), putAll: () => undefined, removeAll: () => undefined };

export interface RuntimeDeps {
  main: SnapWorkbook;
  session?: { email: string; role: string } | null;   // the session Azure already checked
  courses?: () => unknown[];                           // readAllCoursesFromCache_ (a fresh copy each call)
  tabAllowedForSession?: (key: string) => boolean;
  /** Azure's versions of the Code.gs live-data passes (no stored Script / User Property maps yet — Phase 3). */
  live?: { applyRosterHiddenStaffFilter_: (c: unknown[]) => unknown; applyLivePresence_: (c: unknown[]) => unknown; applyLastLogin_: (c: unknown[]) => unknown; applyStudentOnboardedFlag_: (c: unknown[]) => unknown };
  attendance: SnapWorkbook | null;
  settings: Record<string, string>;
  isRosterHiddenStaffEmail_: (email: unknown) => boolean;
  apsTabAllowed_: (role: string, key: string) => boolean;
  isOnCallCoordinatorEmail_: (email: unknown) => boolean;
}

export function makeRuntime(d: RuntimeDeps): Record<string, unknown> {
  const props = {
    getProperty: (k: string) => (Object.prototype.hasOwnProperty.call(d.settings, k) ? d.settings[k] : null),
    getProperties: () => ({ ...d.settings }),
    setProperty: () => { throw new Error(READ_ONLY_MSG); },
    deleteProperty: () => { throw new Error(READ_ONLY_MSG); },
  };
  return {
    SpreadsheetApp: { openById: () => { throw new Error('Azure runtime: use getWorkbook_ / getAttendanceWorkbook_.'); } },
    CacheService: { getScriptCache: () => noCache, getUserCache: () => noCache },
    PropertiesService: { getScriptProperties: () => props, getUserProperties: () => props },
    Utilities,
    Session: { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => '' }) },
    console: { log: () => undefined, info: () => undefined, warn: (m: unknown) => quiet(m) || console.warn('[Gas] ' + String(m).slice(0, 200)), error: (m: unknown) => quiet(m) || console.error('[Gas] ' + String(m).slice(0, 200)) },
    getWorkbook_: () => d.main,
    getAttendanceWorkbook_: () => { if (!d.attendance) throw new Error('Could not open the Attendance data right now.'); return d.attendance; },
    isRosterHiddenStaffEmail_: d.isRosterHiddenStaffEmail_,
    apsTabAllowed_: d.apsTabAllowed_,
    isOnCallCoordinatorEmail_: d.isOnCallCoordinatorEmail_,
    // Session / tab checks: Azure has already verified the token server-side (requireSession); the copied code gets that
    // same session, and its Access Control check uses the same switches.
    requireValidSession_: () => { if (!d.session) throw new Error('SESSION_EXPIRED: please sign in again.'); return { email: d.session.email, role: d.session.role }; },
    apsRequireTabForToken_: (_t: unknown, key: string) => {
      if (!d.session) throw new Error('SESSION_EXPIRED: please sign in again.');
      if (d.tabAllowedForSession && !d.tabAllowedForSession(key)) throw new Error('ACCESS_OFF: This section has been turned off for your role by the APS administrator.');
      return { email: d.session.email, role: d.session.role };
    },
    readAllCoursesFromCache_: () => (d.courses ? d.courses() : []),
    applyRosterHiddenStaffFilter_: (c: unknown[]) => (d.live ? d.live.applyRosterHiddenStaffFilter_(c) : c),
    applyLivePresence_: (c: unknown[]) => (d.live ? d.live.applyLivePresence_(c) : c),
    applyLastLogin_: (c: unknown[]) => (d.live ? d.live.applyLastLogin_(c) : c),
    applyStudentOnboardedFlag_: (c: unknown[]) => (d.live ? d.live.applyStudentOnboardedFlag_(c) : c),
  };
}

/** Sheets API serial date/time (days since 1899-12-30, wall time of the spreadsheet's time zone) → instant. */
export function serialToDate(serial: number, tz: string): Date {
  const wallMs = Math.round((serial - 25569) * 86400000); // the wall time, written as if it were UTC
  let guess = wallMs;
  for (let i = 0; i < 2; i++) {
    const off = Utilities.formatDate(new Date(guess), tz, 'XXX');
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(off);
    const offMs = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
    guess = wallMs - offMs;
  }
  return new Date(guess);
}

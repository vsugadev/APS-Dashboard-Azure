/**
 * READ-ONLY Apps Script runtime for the Code.gs reader functions copied into src/gas/scope.generated.ts.
 *
 *  - SpreadsheetApp-like workbooks are SNAPSHOTS of whole sheets read through the Sheets API before the call
 *    (getValues gives the same types Apps Script gives: numbers, strings, booleans, '' for empty, Date for cells
 *    formatted as a date / time — converted in the spreadsheet's own time zone).
 *  - An EXISTING sheet can never be changed (any write throws READ_ONLY). A sheet that does not exist yet behaves as
 *    Code.gs's "create it" path in memory only: it is empty for this request and nothing is written to Google.
 *  - CacheService: nothing cached here (the data source caches whole sheets for 60 s).
 *  - PropertiesService: Apps Script's live Script / User Properties (allow-listed, never secrets) under the plain App
 *    Service settings; a write stays in the request only (in memory, like a sheet created in memory).
 */
import { Utilities } from './utilities';
import type { SheetGrid, WorkbookKey, ValuesRequest } from '../data/types';

/** Something the copied code asked for that is not in this request's snapshot yet. Recorded through `need` (so it is
 *  loaded even when Code.gs catches the error and falls back), then thrown; the runner loads it and runs again. */
export type NeedRequest = { kind: 'sheet'; book: WorkbookKey; sheet: string } | { kind: 'values'; book: WorkbookKey; req: ValuesRequest } | { kind: 'book'; book: WorkbookKey };
export class NeedData extends Error {
  constructor(public need: NeedRequest) { super('NEED_DATA: ' + (need.kind === 'sheet' ? need.sheet : need.kind)); }
}
export function valuesKey(r: ValuesRequest): string { return JSON.stringify([r.ranges, r.valueRenderOption || '', r.dateTimeRenderOption || '', r.majorDimension || '']); }

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
  // Number format only (no value change): Code.gs re-applies it on every read as a self-heal (e.g. the reference-letter
  // date columns). Azure never sends it to Google — a no-op here, so the read continues exactly as Apps Script's.
  setNumberFormat(): this { return this; }
}

export class SnapWorkbook {
  private sheets: Record<string, SnapSheet> = {};
  /** `titles` = every sheet that exists in Google. A sheet that exists but was not read into this snapshot throws, so a
   *  reader can never silently see an "empty" sheet; a sheet that does not exist is null (Code.gs "create it" path). */
  constructor(private id: string, grids: Record<string, SheetGrid | null>, private tz = 'America/New_York', private titles: string[] | null = null,
    private book: WorkbookKey = 'main', private need: ((n: NeedRequest) => void) | null = null) {
    for (const [name, g] of Object.entries(grids)) if (g) this.sheets[name] = new SnapSheet(name, g.values.map((r) => r.slice()), true);
  }
  private missing(n: string): never {
    const req: NeedRequest = { kind: 'sheet', book: this.book, sheet: n };
    if (this.need) { this.need(req); throw new NeedData(req); }
    throw new Error('Azure runtime: sheet "' + n + '" exists but was not read for this request.');
  }
  getSheetByName(n: string): SnapSheet | null {
    if (this.sheets[n]) return this.sheets[n];
    if (this.titles && this.titles.indexOf(n) > -1) return this.missing(n); // exists in Google, not read yet → load and run again
    return null;
  }
  insertSheet(n: string): SnapSheet { return (this.sheets[n] = new SnapSheet(n, [], false)); } // in memory only — never sent to Google
  /** Every sheet of the spreadsheet (as Apps Script): read ones as they are; the others by name only — reading their data
   *  asks for them to be loaded. */
  getSheets(): unknown[] {
    const names = (this.titles || []).concat(Object.keys(this.sheets).filter((n) => !(this.titles || []).includes(n)));
    return names.map((n) => this.sheets[n] || new Proxy({}, { get: (_t, prop) => (prop === 'getName' ? () => n : () => this.missing(n)) }));
  }
  getId(): string { return this.id; }
  getUrl(): string { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
  getSpreadsheetTimeZone(): string { return this.tz; }
}

/** Expected, harmless messages from the copied code (an optional Script Property not set; an audit row Azure does not
 *  write) — not repeated in the App Service log on every request. Never prints a stored value. */
function quiet(m: unknown): boolean { return /^\[Config\] Script Property "[^"]*" is not (set|valid)/.test(String(m)) || /audit not written: READ_ONLY/.test(String(m)) || /NEED_DATA/.test(String(m)) || /^\[Class Meet Live\] Live Meet status is not on Azure yet/.test(String(m)); } // NEED_DATA: Azure loads it and runs again

const noCache = { get: () => null, put: () => undefined, remove: () => undefined, getAll: () => ({}), putAll: () => undefined, removeAll: () => undefined };

export interface RuntimeDeps {
  main: SnapWorkbook;
  session?: { email: string; role: string } | null;   // the session Azure already checked
  courses?: () => unknown[];                           // readAllCoursesFromCache_ (a fresh copy each call)
  tabAllowedForSession?: (key: string) => boolean;
  attendance: SnapWorkbook | null;
  settings: Record<string, string>;
  /** Apps Script's live Script / User Properties (allow-listed snapshot from the Apps Script bridge — src/live). */
  liveProps?: { script: Record<string, string>; user: Record<string, string> };
  /** Sheets advanced service answers already fetched for this request (key = valuesKey), and which book each ID is. */
  values?: Record<string, unknown>;
  bookIds?: Record<string, WorkbookKey>;
  /** Other spreadsheets the copied code opens by ID (Special Classes, Zoho sync log): only the IDs in `extraIds`
   *  (computed by the copied code's own ID functions), opened on demand as read-only snapshots. */
  extraIds?: string[];
  extra?: Record<string, SnapWorkbook>;
  need?: (n: NeedRequest) => void;
  isRosterHiddenStaffEmail_: (email: unknown) => boolean;
  apsTabAllowed_: (role: string, key: string) => boolean;
  isOnCallCoordinatorEmail_: (email: unknown) => boolean;
}

/** Every property key the copied code asked for in this process ('S:' Script, 'U:' User) — tests use it to prove each
 *  key is either a plain setting, in the live-data allow-list, or deliberately never exported (secrets). */
export const PROPERTY_READS = new Set<string>();

export function makeRuntime(d: RuntimeDeps): Record<string, unknown> {
  // Script Properties = Apps Script's live Script Properties (allow-listed snapshot, Phase 3) under the plain App Service
  // settings (a setting set on Azure wins). User Properties = the deploying account's User Properties (Apps Script's
  // second store: presence / last login / onboarded …), allow-listed. A write by the copied code (best-effort caches
  // such as the onboarded list or the class "started" mark) stays in THIS request only — never sent anywhere.
  const live = d.liveProps || { script: {}, user: {} };
  const store = (base: () => Record<string, string>, tag: string) => {
    const writes: Record<string, string | null> = {};
    const get = (k: string): string | null => {
      PROPERTY_READS.add(tag + k);
      if (Object.prototype.hasOwnProperty.call(writes, k)) return writes[k];
      const b = base();
      return Object.prototype.hasOwnProperty.call(b, k) ? b[k] : null;
    };
    const all = () => { const o: Record<string, string> = { ...base() }; for (const [k, v] of Object.entries(writes)) { if (v === null) delete o[k]; else o[k] = v; } return o; };
    const api: any = {
      getProperty: get,
      getProperties: () => { PROPERTY_READS.add(tag + '*'); return all(); },
      getKeys: () => { PROPERTY_READS.add(tag + '*'); return Object.keys(all()); },
      setProperty: (k: string, v: unknown) => { writes[String(k)] = String(v); return api; },
      setProperties: (o: Record<string, unknown>) => { for (const [k, v] of Object.entries(o || {})) writes[k] = String(v); return api; },
      deleteProperty: (k: string) => { writes[String(k)] = null; return api; },
    };
    return api;
  };
  const props = store(() => ({ ...live.script, ...d.settings }), 'S:');
  const userProps = store(() => ({ ...live.user }), 'U:');
  return {
    // openById: the two APS spreadsheets, plus the extra ones the copied code computes (read-only snapshots).
    SpreadsheetApp: { openById: (id: string) => {
      const book = d.bookIds && d.bookIds[String(id)];
      if (book === 'main') return d.main;
      if (book === 'attendance' && d.attendance) return d.attendance;
      const k = String(id);
      if (d.extraIds && d.extraIds.indexOf(k) > -1) {
        if (d.extra && d.extra[k]) return d.extra[k];
        const n: NeedRequest = { kind: 'book', book: ('id:' + k) as WorkbookKey };
        if (d.need) d.need(n);
        throw new NeedData(n);
      }
      throw new Error('Azure runtime: SpreadsheetApp.openById only opens the APS spreadsheets.');
    } },
    // Sheets advanced service (read only): Values.batchGet with the same options Code.gs passes, answered from the real
    // Sheets API values:batchGet — only for the APS spreadsheets (and the extra ones above).
    Sheets: { Spreadsheets: { Values: { batchGet: (id: string, o: ValuesRequest) => {
      const book = (d.bookIds && d.bookIds[String(id)]) || (d.extraIds && d.extraIds.indexOf(String(id)) > -1 ? ('id:' + String(id)) as WorkbookKey : undefined);
      if (!book) throw new Error('Azure runtime: Sheets.batchGet only reads the APS spreadsheets.');
      const req: ValuesRequest = { ranges: (o.ranges || []).map(String), valueRenderOption: o.valueRenderOption, dateTimeRenderOption: o.dateTimeRenderOption, majorDimension: o.majorDimension };
      const hit = d.values && d.values[book + ':' + valuesKey(req)];
      if (hit) return JSON.parse(JSON.stringify(hit));
      const n: NeedRequest = { kind: 'values', book, req };
      if (d.need) d.need(n);
      throw new NeedData(n);
    } } } },
    CacheService: { getScriptCache: () => noCache, getUserCache: () => noCache },
    PropertiesService: { getScriptProperties: () => props, getUserProperties: () => userProps },
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
    // Google profile names need the Admin Directory API (scope not approved yet) → none, as Code.gs when a lookup fails.
    getGoogleProfileName_: () => null,
    // Links in previews point to the LIVE dashboard (Apps Script) until cut-over: APS_DASHBOARD_URL, else Code.gs's fallback.
    apsDashboardUrl_: () => (d.settings.APS_DASHBOARD_URL || 'https://www.avvaiyarpadasalai.org'),
    // Live Google Meet status (Code.gs fetches it with the Meet / Reports APIs under a script lock and keeps it in
    // Apps Script's cache) is not on Azure yet: these throw, Code.gs's own catch then uses the schedule-based status.
    classMeetLiveSnapshot_: () => { throw new Error('Live Meet status is not on Azure yet.'); },
    classMeetApplyLive_: () => null,
    // Chat is not on Azure yet: a constant version (Code.gs's own fallback value) so the realtime poll never asks the page
    // to reload a chat it cannot load here.
    chatVersion_: () => '',
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

/** Instant → Sheets serial date/time in the spreadsheet's time zone (the inverse of serialToDate). */
export function dateToSerial(d: Date, tz: string): number {
  const off = Utilities.formatDate(d, tz, 'XXX');
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(off);
  const offMs = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
  return (d.getTime() + offMs) / 86400000 + 25569;
}

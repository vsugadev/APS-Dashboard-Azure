/**
 * Data sources for Phase 1–4: the SAME Google Sheet the Apps Script dashboard uses (read through the Sheets API),
 * so Azure always agrees with what admins set in the live dashboard. Each sheet range is read once per cache
 * window and parsed into an indexed, reusable result (one bulk read → process in memory → reuse).
 * Phase 5 replaces these readers with Azure SQL tables behind the same DataSource interface.
 */
import * as fs from 'fs';
import type { AppConfig } from '../config';
import { normalizeEmail } from '../lib/email';
import { TtlCache } from '../lib/ttlCache';
import { GOOGLE_SCOPES, googleFetchJson, type AccessTokenProvider } from '../google/serviceAccount';
import type { AccessOverrides, Course, DataSource, SheetGrid, SheetSnapshot, ValuesRequest, WorkbookKey } from './types';
import { serialToDate, dateToSerial } from '../gas/runtime';
import { AC_ROLES, acItem } from '../auth/accessControl';
import { DASHBOARD_ROLES } from '../auth/roles';

// Cache windows. Apps Script clears its caches the moment it writes; Azure cannot see those writes yet
// (writes stay in Apps Script until Phase 5), so Azure keeps short windows instead.
export const COURSES_TTL_MS = 60_000;       // Courses sheet (Apps Script memo: 600 s, invalidated on write)
export const USER_ROLES_TTL_MS = 60_000;    // USER_ROLE_CACHE_SECONDS = 60 in Code.gs
export const ACCESS_TTL_MS = 60_000;        // Access Control (Apps Script: 600 s, cleared on save)
export const SHEET_TTL_MS = 60_000;         // whole-sheet snapshots for the copied Code.gs readers (Apps Script caches 5–10 min)
export const TITLES_TTL_MS = 600_000;       // which sheets exist + the spreadsheet time zone

interface GridCell { effectiveValue?: { numberValue?: number; stringValue?: string; boolValue?: boolean; errorValue?: { type?: string } }; effectiveFormat?: { numberFormat?: { type?: string } } }
/** Sheets API grid data → Apps Script getValues() types (Date for DATE / TIME / DATE_TIME cells, in the sheet's zone). */
export function gridToValues(rowData: { values?: GridCell[] }[] | undefined, tz: string): unknown[][] {
  return (rowData || []).map((r) => (r.values || []).map((c) => {
    const v = c.effectiveValue;
    if (!v) return '';
    if (typeof v.numberValue === 'number') {
      const t = c.effectiveFormat && c.effectiveFormat.numberFormat && c.effectiveFormat.numberFormat.type;
      return t === 'DATE' || t === 'DATE_TIME' || t === 'TIME' ? serialToDate(v.numberValue, tz) : v.numberValue;
    }
    if (typeof v.stringValue === 'string') return v.stringValue;
    if (typeof v.boolValue === 'boolean') return v.boolValue;
    if (v.errorValue) return '#ERROR!';
    return '';
  }));
}

const COURSES_SHEET = 'Courses';                       // getOrCreateCacheSheet_()
const COURSES_DETAIL_RANGE = `${COURSES_SHEET}!R2:R`;  // column R = "Detail JSON" (data[i][17])
const USER_ROLE_SHEET = 'Dashboard_User_Roles';        // USER_ROLE_SHEET_NAME
const AC_SHEET = 'Dashboard_Access_Control';           // AC_SHEET_ (Role, Tab_Key, Tab_Label, Visible, Updated_At, Updated_By)

/** Parsers shared by the Sheets reader and the tests: rows exactly as the Sheets API returns them (strings). */
export function parseCourseRows(rows: string[][]): Course[] {
  const out: Course[] = [];
  for (const r of rows) {
    const cell = r && r[0];
    if (!cell) continue;
    try { out.push(JSON.parse(cell)); } catch { /* skip bad row, as Code.gs does */ }
  }
  return out;
}
export function parseUserRoleRows(rows: string[][]): Record<string, string> {
  const roles: Record<string, string> = {};
  for (const r of rows) {
    const email = normalizeEmail(r[0]);
    const role = String(r[1] || '').trim().toLowerCase();
    const a = r[2];
    const active = a === 'TRUE' || String(a).toLowerCase() === 'true' || a === '1';
    if (email && active && DASHBOARD_ROLES.indexOf(role) > -1) roles[email] = role;
  }
  return roles;
}
export function parseAccessRows(rows: string[][]): AccessOverrides {
  const out: AccessOverrides = {};
  const meta = { at: '', by: '' };
  for (const r of rows) {
    const role = String(r[0] || '').trim().toLowerCase(), key = String(r[1] || '').trim();
    if (AC_ROLES.indexOf(role) < 0 || !acItem(key)) continue;
    (out[role] = out[role] || {})[key] = String(r[3]).toUpperCase() === 'TRUE';
    const at = String(r[4] || '');
    if (at && at > meta.at) { meta.at = at; meta.by = String(r[5] || ''); }
  }
  out.__meta = meta;
  return out;
}

export class SheetsDataSource implements DataSource {
  private cache = new TtlCache();
  constructor(private cfg: AppConfig, private token: AccessTokenProvider) {}

  /** One batchGet for several ranges = one Sheets API call. */
  private async values(ranges: string[]): Promise<string[][][]> {
    if (!this.cfg.targetSpreadsheetId) throw new Error('TARGET_SPREADSHEET_ID is not set.');
    const t = await this.token([GOOGLE_SCOPES.sheetsRead]);
    const qs = ranges.map((r) => 'ranges=' + encodeURIComponent(r)).join('&');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.cfg.targetSpreadsheetId)}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE`;
    const res = await googleFetchJson<{ valueRanges?: { values?: string[][] }[] }>(url, t);
    return (res.valueRanges || []).map((v) => v.values || []);
  }
  async readCourses(): Promise<Course[]> {
    const rows = await this.cache.get('courses', COURSES_TTL_MS, async () => (await this.values([COURSES_DETAIL_RANGE]))[0]);
    return parseCourseRows(rows); // fresh objects every call (callers may mutate), like readAllCoursesFromCache_
  }
  async readConfiguredUserRoles(): Promise<Record<string, string>> {
    return this.cache.get('userRoles', USER_ROLES_TTL_MS, async () => {
      try { return parseUserRoleRows((await this.values([`${USER_ROLE_SHEET}!A2:E`]))[0]); }
      catch (e) { if (/GOOGLE_API_400/.test(String((e as Error).message))) return {}; throw e; } // sheet not created yet
    });
  }
  private bookId(book: WorkbookKey): string { return book === 'main' ? this.cfg.targetSpreadsheetId : this.cfg.attendanceSpreadsheetId; }
  /** Whole sheets with value types, one spreadsheets.get per uncached group; titles + time zone cached 10 min. */
  async readSheets(book: WorkbookKey, names: string[]): Promise<SheetSnapshot> {
    const id = this.bookId(book);
    if (!id) throw new Error(book === 'main' ? 'TARGET_SPREADSHEET_ID is not set.' : 'ATTENDANCE_SPREADSHEET_ID is not set.');
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
    const meta = await this.cache.get('titles:' + id, TITLES_TTL_MS, async () => {
      const t = await this.token([GOOGLE_SCOPES.sheetsRead]);
      const r = await googleFetchJson<{ properties?: { timeZone?: string }; sheets?: { properties?: { title?: string } }[] }>(base + '?fields=properties.timeZone,sheets.properties.title', t);
      return { tz: (r.properties && r.properties.timeZone) || 'America/New_York', titles: (r.sheets || []).map((x) => String(x.properties && x.properties.title)) };
    });
    const sheets: Record<string, SheetGrid | null> = {};
    await Promise.all(names.map(async (name) => {
      if (meta.titles.indexOf(name) < 0) { sheets[name] = null; return; }
      sheets[name] = await this.cache.get('grid:' + id + ':' + name, SHEET_TTL_MS, async () => {
        const t = await this.token([GOOGLE_SCOPES.sheetsRead]);
        const range = encodeURIComponent("'" + name.replace(/'/g, "''") + "'");
        const fields = encodeURIComponent('sheets(data(rowData(values(effectiveValue,effectiveFormat.numberFormat.type))))');
        const r = await googleFetchJson<{ sheets?: { data?: { rowData?: { values?: GridCell[] }[] }[] }[] }>(`${base}?ranges=${range}&includeGridData=true&fields=${fields}`, t);
        const data = r.sheets && r.sheets[0] && r.sheets[0].data && r.sheets[0].data[0];
        return { values: gridToValues(data && data.rowData, meta.tz) };
      });
    }));
    return { timeZone: meta.tz, sheets, titles: meta.titles.slice() };
  }
  /** Sheets API values:batchGet with the caller's options (as the Apps Script advanced service), cached 60 s. */
  async readValues(book: WorkbookKey, req: ValuesRequest): Promise<{ valueRanges: { range: string; values?: unknown[][] }[] }> {
    const id = this.bookId(book);
    if (!id) throw new Error(book === 'main' ? 'TARGET_SPREADSHEET_ID is not set.' : 'ATTENDANCE_SPREADSHEET_ID is not set.');
    return this.cache.get('values:' + id + ':' + JSON.stringify(req), SHEET_TTL_MS, async () => {
      const t = await this.token([GOOGLE_SCOPES.sheetsRead]);
      const qs = req.ranges.map((r) => 'ranges=' + encodeURIComponent(r))
        .concat(['valueRenderOption', 'dateTimeRenderOption', 'majorDimension'].filter((k) => (req as any)[k]).map((k) => k + '=' + encodeURIComponent((req as any)[k]))).join('&');
      const r = await googleFetchJson<{ valueRanges?: { range: string; values?: unknown[][] }[] }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchGet?${qs}`, t);
      return { valueRanges: r.valueRanges || [] };
    });
  }
  async readAccessOverrides(): Promise<AccessOverrides> {
    return this.cache.get('access', ACCESS_TTL_MS, async () => {
      try { return parseAccessRows((await this.values([`${AC_SHEET}!A2:F`]))[0]); }
      catch (e) { console.warn('[AccessControl] read failed — defaults used'); return { __meta: { at: '', by: '' } } as AccessOverrides; }
    });
  }
}

/** Local development / tests: a JSON file { courses: [...], userRoles: {...}, accessOverrides: {...},
 *  sheets?: { main: { <sheet name>: rows }, attendance: {...} } } (dates as "date:<ISO>" strings in the file). */
export class FixtureDataSource implements DataSource {
  constructor(private data: { courses?: Course[]; userRoles?: Record<string, string>; accessOverrides?: AccessOverrides; sheets?: Partial<Record<WorkbookKey, Record<string, unknown[][]>>> }) {}
  async readSheets(book: WorkbookKey, names: string[]): Promise<SheetSnapshot> {
    const src = (this.data.sheets && this.data.sheets[book]) || {};
    const sheets: Record<string, SheetGrid | null> = {};
    for (const n of names) sheets[n] = src[n] ? { values: src[n].map((r) => r.map((v) => (v instanceof Date ? new Date(v.getTime()) : typeof v === 'string' && v.startsWith('date:') ? new Date(v.slice(5)) : v))) } : null;
    return { timeZone: 'America/New_York', sheets, titles: Object.keys(src) };
  }
  /** Same answer the Sheets API gives for 'Name'!A2:X style ranges (UNFORMATTED + SERIAL dates, trailing blanks trimmed). */
  async readValues(book: WorkbookKey, req: ValuesRequest): Promise<{ valueRanges: { range: string; values?: unknown[][] }[] }> {
    const src = (this.data.sheets && this.data.sheets[book]) || {};
    const col = (a: string) => a.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    return { valueRanges: req.ranges.map((range) => {
      const m = /^'((?:[^']|'')*)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d*))?$/.exec(range);
      if (!m) throw new Error('fixture: unsupported range ' + range);
      const rows = (src[m[1].replace(/''/g, "'")] || []) as unknown[][];
      const c0 = col(m[2]) - 1, c1 = m[4] ? col(m[4]) : Infinity, r0 = Number(m[3]) - 1, r1 = m[5] ? Number(m[5]) : Infinity;
      const conv = (v: unknown) => {
        const d = v instanceof Date ? v : typeof v === 'string' && v.startsWith('date:') ? new Date(v.slice(5)) : null;
        if (!d) return v === undefined || v === null ? '' : v;
        if (req.dateTimeRenderOption === 'FORMATTED_STRING') return d.toISOString();
        return dateToSerial(d, 'America/New_York');
      };
      let vals = rows.slice(r0, r1).map((r) => (r || []).slice(c0, c1).map(conv));
      vals = vals.map((r) => { const a = r.slice(); while (a.length && (a[a.length - 1] === '' || a[a.length - 1] === undefined)) a.pop(); return a; });
      while (vals.length && !vals[vals.length - 1].length) vals.pop();
      return vals.length ? { range, values: vals } : { range };
    }) };
  }
  static fromFile(path: string): FixtureDataSource {
    return new FixtureDataSource(fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {});
  }
  async readCourses(): Promise<Course[]> { return JSON.parse(JSON.stringify(this.data.courses || [])); }
  async readConfiguredUserRoles(): Promise<Record<string, string>> { return { ...(this.data.userRoles || {}) }; }
  async readAccessOverrides(): Promise<AccessOverrides> { return JSON.parse(JSON.stringify(this.data.accessOverrides || {})); }
}

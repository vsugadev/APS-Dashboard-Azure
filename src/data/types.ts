/** Shapes read from the Google Sheet "Courses" tab (column R "Detail JSON"), as Code.gs writes them. Only the
 *  fields Phase 1 needs are typed; everything else is kept as-is for later phases. */
export interface Person { email: string; name?: string; [k: string]: unknown }
export interface ClassSupport { email: string; member?: boolean; roles?: string[]; [k: string]: unknown }
export interface Course {
  id: string;
  name: string;
  teachers?: Person[];
  students?: Person[];
  rosterTeacherEmails?: string[];   // r46: every Classroom teacher, incl. hidden tcs_/tts_ accounts (server-side only)
  classSupport?: ClassSupport[];    // Primary Teacher / VP / HM named on the class
  [k: string]: unknown;
}
/** Saved Access Control switches: { role: { tabKey: true|false } } (+ __meta). */
export type AccessOverrides = Record<string, Record<string, boolean>> & { __meta?: { at: string; by: string } };

/** One whole sheet as Apps Script getValues() sees it: numbers, strings, booleans, '' for empty, Date for date cells. */
export interface SheetGrid { values: unknown[][] }
/** 'main' / 'attendance' = the two APS spreadsheets; 'id:<spreadsheetId>' = another spreadsheet a copied Code.gs reader
 *  opens by ID (Special Classes, Zoho sync log) — only the IDs the copied code itself computes (src/gas/run.ts). */
export type WorkbookKey = 'main' | 'attendance' | `id:${string}`;
export interface SheetSnapshot { timeZone: string; sheets: Record<string, SheetGrid | null>; titles: string[] } // null = the sheet does not exist; titles = all sheets

/** Sheets API values:batchGet request (same fields as the Apps Script Sheets advanced service). */
export interface ValuesRequest { ranges: string[]; valueRenderOption?: string; dateTimeRenderOption?: string; majorDimension?: string }

export interface DataSource {
  /** Every course row (parsed Detail JSON), like readAllCoursesFromCache_(). Callers may mutate the result. */
  readCourses(): Promise<Course[]>;
  /** Active rows of "Dashboard_User_Roles": { email: role }, like readConfiguredUserRoles_(). */
  readConfiguredUserRoles(): Promise<Record<string, string>>;
  /** Rows of "Dashboard_Access_Control", like acOverridesRaw_(). */
  readAccessOverrides(): Promise<AccessOverrides>;
  /** Whole sheets (read-only snapshot) for the Code.gs readers run on Azure. */
  readSheets(book: WorkbookKey, names: string[]): Promise<SheetSnapshot>;
  /** Sheets API values:batchGet (read only), as the Apps Script Sheets advanced service returns it. */
  readValues(book: WorkbookKey, req: ValuesRequest): Promise<{ valueRanges: { range: string; values?: unknown[][] }[] }>;
}

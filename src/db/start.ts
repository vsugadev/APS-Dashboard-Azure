/**
 * Database pilot start-up: when SQL_SERVER + SQL_DATABASE are set, create the table (once), work out the Special
 * Classes spreadsheet and sheet names with the copied Code.gs code itself (scSpreadsheetId_ / scSheetName_ — the same
 * Script Property or Code.gs default as Apps Script), copy them now and then every DB_SYNC_MINUTES, and serve their
 * reads from the database. Any problem: one log line with the fix, and reads simply stay on Google Sheets.
 */
import type { AppContext } from '../app/context';
import { gasScopeFor } from '../api/endpoints/classes';
import { DbBackedDataSource } from './dbData';
import { SheetSync } from './sync';
import { describeDbError, type SheetStore } from './sheetStore';

/** Code.gs SC_ENR_SHEET_ (test/db.test.ts checks it against Code.gs). */
export const SC_ENROLLMENTS_SHEET = 'APS_SPECIAL_CLASSES_ENROLLMENTS';

export async function startDatabase(ctx: AppContext, store: SheetStore, db: DbBackedDataSource, everyMs: number,
  log: (m: string) => void = console.log): Promise<SheetSync | null> {
  try { await store.ensureSchema(); }
  catch (e) { log('[DB] Azure SQL not reachable: ' + describeDbError(e) + ' — reads stay on Google Sheets.'); return null; }
  let book = '', names: string[] = [];
  try {
    const S = await gasScopeFor(ctx);
    book = 'id:' + String(S.scSpreadsheetId_() || '').trim();
    names = [String(S.scSheetName_() || '').trim(), SC_ENROLLMENTS_SHEET].filter(Boolean);
  } catch (e) { log('[DB] Special Classes spreadsheet unknown: ' + String((e as Error).message).slice(0, 100)); return null; }
  if (book === 'id:') { log('[DB] Special Classes spreadsheet ID is empty — nothing copied.'); return null; }
  const sync = new SheetSync(db.innerSource(), store, book, names, log);
  db.book = book; db.names = new Set(names);
  await sync.runOnce();
  sync.start(everyMs);
  return sync;
}

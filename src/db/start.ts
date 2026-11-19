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
import { describeDbError, type SheetStore, type OwnedStore } from './sheetStore';
import type { WorkbookKey } from '../data/types';

/** Code.gs SC_ENR_SHEET_ (test/db.test.ts checks it against Code.gs). */
export const SC_ENROLLMENTS_SHEET = 'APS_SPECIAL_CLASSES_ENROLLMENTS';
/** Code.gs SC_AUDIT_SHEET_ (tested against Code.gs). */
export const SC_AUDIT_SHEET = 'APS_SPECIAL_CLASSES_AUDIT';

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
  db.book = book;
  if (ctx.cfg.scOwner === 'azure') {
    // Stage 3: the programs + audit sheets are OWNED by the database. First start: import them from Google once.
    const owned = [names[0], SC_AUDIT_SHEET];
    db.owned = new Set(owned);
    if (!(await importOwned(db, store as unknown as OwnedStore, book, owned, log))) return null;
    names = names.filter((n) => owned.indexOf(n) < 0); // the read copy now holds only the enrollments
  }
  const sync = new SheetSync(db.innerSource(), store, book, names, log);
  db.names = new Set(names);
  await sync.runOnce();
  sync.start(everyMs);
  return sync;
}

/** One-time import (SC_OWNER=azure, the owned store has no programs sheet yet): copy programs + audit from Google. From
 *  then on the database is the only owner — Google is never read for them again (the Sheet stays as the last copy). */
export async function importOwned(db: DbBackedDataSource, store: OwnedStore, book: string, owned: string[], log: (m: string) => void): Promise<boolean> {
  try {
    await store.ensureOwnedSchema();
    const have = await store.getOwned(book, owned);
    if (have[owned[0]]) { db.ownedReady = true; log('[DB] Special Classes are OWNED by Azure SQL (SC_OWNER=azure) — ' + owned.map((n) => n + ' v' + (have[n] ? have[n]!.version : 0)).join(', ') + '.'); return true; }
    const snap = await db.innerSource().readSheets(book as WorkbookKey, owned);
    const g = snap.sheets[owned[0]];
    if (!g) { log('[DB] SC_OWNER=azure: the programs sheet "' + owned[0] + '" is not in the Google spreadsheet — nothing imported; saves refused.'); return false; }
    for (const n of owned) { const x = snap.sheets[n]; if (x && !have[n]) await store.putOwned(book, n, x.values, snap.timeZone, 0, 'import'); }
    db.ownedReady = true;
    log('[DB] Special Classes imported into Azure SQL and now OWNED there (SC_OWNER=azure) — ' + owned.map((n) => n + ' ' + (snap.sheets[n] ? snap.sheets[n]!.values.length : 0) + ' rows').join(', ') + '.');
    return true;
  } catch (e) {
    if (String((e as Error).message) === 'CONFLICT') { db.ownedReady = true; return true; } // another instance imported first
    log('[DB] SC_OWNER=azure: Special Classes could not be imported: ' + describeDbError(e) + ' — Special Classes stay unavailable until fixed.');
    return false;
  }
}

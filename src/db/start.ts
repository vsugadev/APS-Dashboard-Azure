import { Reconciler, MssqlReconStore } from './reconcile';
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
import { backgroundSource } from '../data/background';

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
  const sync = new SheetSync(backgroundSource(db.innerSource()), store, book, names, log); // v0.24.1: behind people's screens
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
    const snap = await backgroundSource(db.innerSource()).readSheets(book as WorkbookKey, owned);
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

/**
 * v0.18.0 (Phase 5 step 1): whole-spreadsheet copies of the books in DB_COPY ('main', 'attendance'). Every tab (new tabs
 * included, minus DB_COPY_EXCLUDE) is copied every DB_SYNC_MINUTES, read back and checked identical, and the check is
 * counted per day (dbo.sheet_sync_log). Reads switch to the copy only for the books in DB_READS. A save marks the copies
 * dirty: reads go to Google and a fresh copy starts at once (at most one every 20 s).
 */
export async function startCopies(ctx: AppContext, store: SheetStore, db: DbBackedDataSource, everyMs: number,
  log: (m: string) => void = console.log): Promise<SheetSync[]> {
  const books = ctx.cfg.dbCopyBooks.filter((b) => b === 'main' || (b === 'attendance' && !!ctx.cfg.attendanceSpreadsheetId));
  if (!books.length) return [];
  try { await store.ensureSchema(); } catch (e) { log('[DB] spreadsheet copies not started: ' + describeDbError(e)); return []; }
  let exclude: RegExp | null = null;
  try { exclude = ctx.cfg.dbCopyExclude ? new RegExp(ctx.cfg.dbCopyExclude) : null; } catch { log('[DB] DB_COPY_EXCLUDE is not a valid pattern — nothing excluded.'); }
  const syncs: SheetSync[] = [];
  for (const book of books) {
    const reads = ctx.cfg.dbReadBooks.indexOf(book) > -1;
    const sync = new SheetSync(backgroundSource(db.innerSource()), store, book, [], log, Date.now, 'Spreadsheet "' + book + '"', { discover: true, exclude, onDone: (t, ok) => db.copyDone(book, t, ok), onStored: (b, n, v, tz, at) => db.cacheStored(b, n, v, tz, at) });
    db.addCopy(book, () => new Set(sync.names), reads);
    syncs.push(sync);
    await sync.runOnce();
    sync.start(everyMs);
    log('[DB] Spreadsheet "' + book + '": copied to Azure SQL every ' + Math.round(everyMs / 60000) + ' min and checked; reads ' + (reads ? 'come from the copy (DB_READS)' : 'stay on Google Sheets until DB_READS includes it') + '.');
  }
  let pending: NodeJS.Timeout | null = null, lastKick = 0;
  db.onDirty = () => { // after a save: one fresh copy of every book, at most every 60 s (v0.23.3: was 20 s — Sheets API budget)
    if (pending) return;
    const wait = Math.max(0, 60_000 - (Date.now() - lastKick));
    pending = setTimeout(() => { pending = null; lastKick = Date.now(); for (const s of syncs) void s.runOnce(); }, wait);
    pending.unref?.();
  };
  // v0.21.0: record-level reconciliation (sheet = source of truth vs the Azure SQL copy), RECONCILE_HOURS (0 = off)
  if (ctx.cfg.reconcileHours > 0) {
    const save = typeof (store as any).connectPool === 'function' ? new MssqlReconStore(() => (store as any).connectPool()) : null;
    new Reconciler(backgroundSource(db.innerSource()), store, syncs.map((s) => ({ book: s.book, tabs: () => s.names.slice(), copyAgain: () => s.runOnce() })), save, log)
      .start(ctx.cfg.reconcileHours * 3_600_000);
    log('[Reconcile] record-level check of the copies every ' + ctx.cfg.reconcileHours + ' h (first in 5 min) → dbo.reconcile_run.');
  }
  return syncs;
}

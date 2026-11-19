/**
 * Database stage 3 (v0.13.0) — Azure SQL OWNS Special Classes when SC_OWNER=azure.
 *
 * saveSpecialClass / setSpecialClassActive run HERE: the copied Code.gs functions themselves (same validation, Admin /
 * read-only checks, ID numbering, audit rows) against a WRITABLE in-memory copy of the programs + audit sheets read from
 * the database. The sheets they changed are then stored back with an optimistic version check, one save at a time
 * (in-process lock; the version check also covers a second App Service instance). Nothing is written to Google.
 *
 * Apps Script reaches the same functions through the reverse bridge (src/api/bridge.ts), so both dashboards show and
 * change the same records. SC_OWNER unset → these two names are forwarded to Apps Script exactly as before (writes.ts).
 */
import type { AppContext } from '../app/context';
import { gasRun, gasScopeFor } from '../api/endpoints/classes';
import { DbBackedDataSource } from './dbData';
import { describeDbError } from './sheetStore';

export const SC_OWNED_FNS = ['saveSpecialClass', 'setSpecialClassActive'];
export const SC_NOT_READY_MSG = 'Special Classes are not available right now (the database is not ready). Please try again later.';
export const SC_CONFLICT_MSG = 'Someone else changed Special Classes at the same moment — please reload and save again.';

export function scOwnedByAzure(ctx: AppContext): boolean { return ctx.cfg.scOwner === 'azure'; }

let chain: Promise<unknown> = Promise.resolve();
/** One owned save at a time in this process. */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

/** Runs one owned Special Classes save for an already-verified session. Returns what the Code.gs function returns. */
export async function runOwnedSave(ctx: AppContext, session: { email: string; role: string }, token: string, fn: string, args: unknown[]): Promise<unknown> {
  if (SC_OWNED_FNS.indexOf(fn) < 0) throw new Error('Not an owned Special Classes action.');
  const db = ctx.data;
  if (!(db instanceof DbBackedDataSource) || !db.ownedReady || !db.book) throw new Error(SC_NOT_READY_MSG);
  return serial(async () => {
    let before;
    try { before = await db.readOwned(); } catch (e) { console.warn('[SC owner] read failed: ' + describeDbError(e)); throw new Error(SC_NOT_READY_MSG); }
    const scId = db.book.slice(3);
    let dirty: Record<string, unknown[][]> = {}, tz = '';
    const value = await gasRun(ctx, session, (S) => S[fn](token, ...args), {
      writable: [scId],
      capture: (books) => { const b = books[scId]; if (b) { dirty = b.dirtySheets(); tz = b.getSpreadsheetTimeZone(); } },
    });
    const names = Object.keys(dirty);
    const strays = names.filter((n) => !db.owned.has(n));
    if (strays.length) console.warn('[SC owner] ' + fn + ' changed sheets that are not owned (ignored): ' + strays.join(', '));
    const order = Array.from(db.owned).filter((n) => names.indexOf(n) > -1); // programs first, then audit
    try {
      for (const n of order) {
        const cur = before[n];
        await db.ownedStore().putOwned(db.book, n, dirty[n], cur ? cur.timeZone : (tz || 'America/New_York'), cur ? cur.version : 0, session.email);
      }
    } catch (e) {
      if (String((e as Error).message) === 'CONFLICT') throw new Error(SC_CONFLICT_MSG);
      console.error('[SC owner] ' + fn + ' not stored: ' + describeDbError(e));
      throw new Error('The change could not be saved right now (database). Please try again in a minute.');
    }
    ctx.data.invalidate?.();
    console.log('[SC owner] ' + fn + ' by ' + session.email + ' stored in Azure SQL (' + (order.join(', ') || 'no change') + ')');
    return value;
  });
}

/** The owned programs sheet for the reverse bridge (Apps Script's Special Classes screens). */
export async function ownedProgramsGrid(ctx: AppContext): Promise<{ values: unknown[][]; timeZone: string; version: number }> {
  const db = ctx.data;
  if (!(db instanceof DbBackedDataSource) || !db.ownedReady) throw new Error('SC_OWNER_NOT_READY');
  const S = await gasScopeFor(ctx);
  const name = String(S.scSheetName_() || '').trim();
  const got = await db.readOwned();
  const g = got[name];
  return g ? { values: g.values, timeZone: g.timeZone, version: g.version } : { values: [], timeZone: 'America/New_York', version: 0 };
}

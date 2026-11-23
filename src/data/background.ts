/**
 * v0.24.1 — a DataSource whose reads run as BACKGROUND work (src/google/apiGate.ts inBackground): used by the spreadsheet
 * copies, the reconciliation and the start-up warm-up, so a person opening a screen is never queued behind them.
 * Same answers, same caches; only the order of Google calls changes.
 */
import type { DataSource } from './types';
import { inBackground } from '../google/apiGate';

const READS = new Set(['readCourses', 'readConfiguredUserRoles', 'readAccessOverrides', 'readSheets', 'readValues']);

export function backgroundSource(src: DataSource): DataSource {
  return new Proxy(src, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function') return v;
      if (typeof prop === 'string' && READS.has(prop)) return (...args: unknown[]) => inBackground(() => (v as (...a: unknown[]) => Promise<unknown>).apply(target, args));
      return (v as (...a: unknown[]) => unknown).bind(target);
    },
  });
}

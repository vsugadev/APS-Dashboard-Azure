/**
 * v0.24.2 — who a request is for, available deep inside the data layer without passing it through every call.
 * The registry runs each browser call inside REQUEST.run({ email: null }); requireSession() fills in the signed-in e-mail
 * (server-side, from the session — never from the browser). Used only to decide "this person just saved: read their own
 * change from Google until the copy has it" (src/db/dbData.ts). Background work has no request (getStore() undefined).
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestInfo { email: string | null; dataMs: number; runs: number }
export const REQUEST = new AsyncLocalStorage<RequestInfo>();
export const newRequest = (): RequestInfo => ({ email: null, dataMs: 0, runs: 0 });
export function requestEmail(): string | null { const s = REQUEST.getStore(); return s ? s.email : null; }

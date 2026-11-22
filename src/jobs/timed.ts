/**
 * Phase 4 step 2 (v0.23.0) — the FIXED-TIME jobs on Azure's timetable: daily at a configured hour, or a weekly window.
 *
 *   daily syncs (APS_DAILY_SYNC_HOUR): apsDailyForceSync, apsDailyAttendanceSync, classroomRosterAutoSync, apsDailyMeetLinkAutoMap
 *   sendWeeklyClassTeacherAvailabilityReport (CTA hour + time zone), apsAttQuzMarkCompleteDaily (Mark-Complete hour),
 *   apsDailySummaryPrep / apsDailySummaryReport / apsMonthlySummaryReport (6 / 7 / 8 AM), PTA coverage notices (Fri / Sat / Sun windows)
 *
 *  - WHEN comes from Apps Script (bridge action "jobSchedule", AzureBridge.gs r141): the same settings that create each trigger
 *    there, refreshed hourly — a time changed by an Admin applies here too. A job runs only while its trigger is installed there
 *    (so a switched-off job stays off), and only when listed in AZURE_TIMED_JOBS here AND in APS_JOBS_ON_AZURE there.
 *  - WHAT is unchanged: the job body runs in Apps Script (bridge action "job"), as its trigger would.
 *  - Once per slot: the slot = the configured time today (or this week's weekday) in its time zone; run from that minute within
 *    a window (daily 6 h, weekly 12 h), never before; the lease row (dbo.job_lease) makes it once across instances, and
 *    dbo.job_run (started_at ≥ slot start) says the slot is done. One attempt per slot, exactly like a trigger.
 *  - The Apps Script trigger stays as a safety net: it skips while Azure's timetable is alive, and if it ever runs a slot itself,
 *    Azure's run of that slot is refused (RAN_BY_TRIGGER) — never twice.
 */
import { bridgeCall, type FetchLike } from '../live/liveSource';
import type { JobStore, JobRunner } from './scheduler';
import { randomUUID } from 'crypto';

export const TIMED_JOBS = ['apsDailyForceSync', 'apsDailyAttendanceSync', 'classroomRosterAutoSync', 'apsDailyMeetLinkAutoMap', 'sendWeeklyClassTeacherAvailabilityReport',
  'apsAttQuzMarkCompleteDaily', 'apsDailySummaryPrep', 'apsDailySummaryReport', 'apsMonthlySummaryReport', 'apsPtaCoverageNotifyFriday', 'apsPtaCoverageNotifySaturday', 'apsPtaCoverageNotifySunday'];
export const TIMED_WINDOW_MIN = { daily: 6 * 60, weekly: 12 * 60 };

export interface TimedSpec { handler: string; kind: 'daily' | 'weekly'; hour: number; minute: number; weekday: number | null; tz: string; installed: boolean }

export function parseTimedList(raw: string | undefined): { on: string[]; unknown: string[] } {
  const names = String(raw || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  return { on: names.filter((n) => TIMED_JOBS.includes(n)).filter((n, i, a) => a.indexOf(n) === i), unknown: names.filter((n) => !TIMED_JOBS.includes(n)) };
}

/** Wall-clock parts of `t` in `tz`. */
function parts(t: number, tz: string): { y: number; m: number; d: number; hh: number; mm: number; dow: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p: Record<string, string> = {}; for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
/** UTC ms of a wall-clock time in `tz` (exact across DST: corrected twice). */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) { const p = parts(guess, tz); const asIf = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm); guess += Date.UTC(y, m - 1, d, hh, mm) - asIf; }
  return guess;
}
/** Start (UTC ms) of the slot that `now` belongs to, i.e. the latest slot start ≤ now. */
export function slotStart(spec: TimedSpec, now: number): number {
  const p = parts(now, spec.tz);
  const back = spec.kind === 'weekly' && spec.weekday !== null ? (p.dow - spec.weekday + 7) % 7 : 0;
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d) - back * 86_400_000);
  let s = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), spec.hour, spec.minute, spec.tz);
  if (s > now) { const step = spec.kind === 'weekly' ? 7 : 1; const b2 = new Date(base.getTime() - step * 86_400_000); s = zonedToUtc(b2.getUTCFullYear(), b2.getUTCMonth() + 1, b2.getUTCDate(), spec.hour, spec.minute, spec.tz); }
  return s;
}

export type ScheduleSource = () => Promise<{ jobs: TimedSpec[]; onAzure: string[] }>;
export function bridgeScheduleSource(url: string, secret: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): ScheduleSource {
  return async () => {
    const r: any = await bridgeCall(url, secret, { action: 'jobSchedule', v: 1 }, fetchImpl, Date.now, 30_000);
    const jobs: TimedSpec[] = (Array.isArray(r && r.jobs) ? r.jobs : []).filter((j: any) => j && TIMED_JOBS.includes(j.handler) && (j.kind === 'daily' || j.kind === 'weekly')
      && Number.isInteger(j.hour) && j.hour >= 0 && j.hour <= 23 && Number.isInteger(j.minute) && j.minute >= 0 && j.minute <= 59 && typeof j.tz === 'string')
      .map((j: any) => ({ handler: j.handler, kind: j.kind, hour: j.hour, minute: j.minute, weekday: Number.isInteger(j.weekday) ? j.weekday : null, tz: j.tz, installed: !!j.installed }));
    return { jobs, onAzure: Array.isArray(r && r.onAzure) ? r.onAzure.map(String) : [] };
  };
}

export class TimedJobScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = new Set<string>();
  private sched: { jobs: TimedSpec[]; onAzure: string[]; at: number } | null = null;
  private doneSlot: Record<string, number> = {};
  private lastNote: Record<string, string> = {};
  readonly holder = randomUUID();
  constructor(private handlers: string[], private store: JobStore, private run: JobRunner, private source: ScheduleSource,
    private now: () => number = Date.now, private log: (m: string) => void = console.log) {}

  private note(k: string, m: string): void { if (this.lastNote[k] !== m) { this.lastNote[k] = m; this.log(m); } }

  async tick(): Promise<string[]> {
    const t = this.now(), started: string[] = [];
    if (!this.sched || t - this.sched.at > 3_600_000) {
      try {
        const s = await this.source(); this.sched = { ...s, at: t };
        const notThere = this.handlers.filter((h) => !s.onAzure.includes(h));
        if (notThere.length) this.note('onAzure', '[Jobs] fixed-time jobs NOT in Apps Script APS_JOBS_ON_AZURE (Apps Script keeps running them; Azure does not): ' + notThere.join(', '));
      } catch (e) { this.note('sched', '[Jobs] fixed-time schedule not available from Apps Script (' + String((e as Error).message).slice(0, 40) + ') — tried again next minute; the Apps Script triggers are the safety net.'); if (!this.sched) return started; }
    }
    for (const spec of this.sched.jobs) {
      const h = spec.handler;
      if (!this.handlers.includes(h) || !this.sched.onAzure.includes(h) || !spec.installed || this.running.has(h)) continue;
      const s = slotStart(spec, t), win = TIMED_WINDOW_MIN[spec.kind] * 60_000;
      if (t - s > win || this.doneSlot[h] === s) continue;
      try {
        if ((await this.store.lastStarted(h)) >= s) { this.doneSlot[h] = s; continue; }
        if (!(await this.store.lease(h, this.holder, t, s + win))) { this.doneSlot[h] = s; continue; }
      } catch (e) { this.note(h + ':db', '[Jobs] ' + h + ': timetable not available in Azure SQL (' + String((e as Error).message).slice(0, 60) + ') — tried again next minute.'); continue; }
      this.doneSlot[h] = s; started.push(h);
      void this.runOne(h, t, s);
    }
    return started;
  }

  private async runOne(h: string, t: number, s: number): Promise<void> {
    this.running.add(h);
    const runId = randomUUID();
    try {
      const r = await this.run(h, runId);
      const finishedAt = this.now();
      await this.store.record({ handler: h, runId, startedAt: t, finishedAt, ok: r.ok, summary: r.summary }).catch(() => undefined);
      const late = Math.round((t - s) / 60_000);
      this.log('[Jobs] ' + h + ' (fixed time' + (late > 1 ? ', ' + late + ' min after its slot' : '') + ') ran on Azure\'s timetable: ' + (r.ok ? 'ok' : 'FAILED') + ' (' + Math.round((finishedAt - t) / 1000) + ' s)' + (r.ok ? (/RAN_BY_TRIGGER/.test(r.summary) ? ' — already run by the Apps Script trigger (skipped)' : '') : ' — ' + r.summary.slice(0, 160)));
    } finally { this.running.delete(h); }
  }

  start(everyMs = 60_000): void {
    if (this.timer || !this.handlers.length) return;
    this.log('[Jobs] fixed-time jobs on Azure\'s timetable: ' + this.handlers.join(', ') + ' (times from Apps Script; Apps Script must list the same names in APS_JOBS_ON_AZURE).');
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, everyMs);
    this.timer.unref?.();
  }
}

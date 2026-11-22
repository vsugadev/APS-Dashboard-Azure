/** Phase 4 step 2 (v0.23.0): fixed-time daily / weekly jobs on Azure's timetable — slots, once per slot, the Apps Script safety net. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import crypto from 'crypto';
import { TimedJobScheduler, slotStart, zonedToUtc, parseTimedList, bridgeScheduleSource, TIMED_JOBS, type TimedSpec } from '../src/jobs/timed';
import { MemoryJobStore, bridgeJobRunner } from '../src/jobs/scheduler';

const NY = 'America/New_York';
const daily = (h: string, hour: number, minute = 0, tz = NY): TimedSpec => ({ handler: h, kind: 'daily', hour, minute, weekday: null, tz, installed: true });
const iso = (t: number) => new Date(t).toISOString();

test('slots: configured hour in its own time zone, exact across DST; weekly windows; the slot before the time is yesterday / last week', () => {
  assert.equal(iso(zonedToUtc(2026, 11, 23, 17, 0, NY)), '2026-11-23T22:00:00.000Z');
  assert.equal(iso(zonedToUtc(2026, 7, 1, 17, 0, NY)), '2026-07-01T21:00:00.000Z');
  assert.equal(iso(zonedToUtc(2026, 11, 1, 6, 0, NY)), '2026-11-01T11:00:00.000Z', 'DST ends that night');
  assert.equal(iso(zonedToUtc(2026, 3, 8, 7, 0, NY)), '2026-03-08T11:00:00.000Z', 'DST starts that night');
  const s = daily('apsDailyForceSync', 17);
  assert.equal(iso(slotStart(s, Date.parse('2026-11-23T22:05:00Z'))), '2026-11-23T22:00:00.000Z');
  assert.equal(iso(slotStart(s, Date.parse('2026-11-23T21:59:00Z'))), '2026-11-22T22:00:00.000Z', 'before 5 PM → yesterday\'s slot');
  assert.equal(iso(slotStart(daily('sendWeeklyClassTeacherAvailabilityReport', 18, 0, 'America/Los_Angeles'), Date.parse('2026-11-24T02:30:00Z'))), '2026-11-24T02:00:00.000Z', 'CTA in its own time zone');
  const fri: TimedSpec = { handler: 'apsPtaCoverageNotifyFriday', kind: 'weekly', hour: 17, minute: 30, weekday: 5, tz: NY, installed: true };
  assert.equal(iso(slotStart(fri, Date.parse('2026-11-27T22:31:00Z'))), '2026-11-27T22:30:00.000Z', 'Friday 5:30 PM');
  assert.equal(iso(slotStart(fri, Date.parse('2026-11-30T12:00:00Z'))), '2026-11-27T22:30:00.000Z', 'Monday → last Friday');
  assert.equal(iso(slotStart(fri, Date.parse('2026-11-27T22:29:00Z'))), '2026-11-20T22:30:00.000Z');
  assert.deepEqual(parseTimedList('apsDailyForceSync, apsZohoDailySync apsDailyForceSync'), { on: ['apsDailyForceSync'], unknown: ['apsZohoDailySync'] });
  assert.equal(TIMED_JOBS.length, 12);
});

function sched(o: { onAzure?: string[]; installed?: boolean } = {}) {
  let now = Date.parse('2026-11-23T21:58:00Z'); const store = new MemoryJobStore(); const runs: string[] = []; const logs: string[] = [];
  const spec = { ...daily('apsDailyForceSync', 17), installed: o.installed !== false };
  const src = async () => ({ jobs: [spec, daily('apsDailyAttendanceSync', 17)], onAzure: o.onAzure || ['apsDailyForceSync', 'apsDailyAttendanceSync'] });
  const mk = () => new TimedJobScheduler(['apsDailyForceSync'], store, async (h) => { runs.push(h); return { ok: true, summary: '{"synced":1}' }; }, src, () => now, (m) => logs.push(m));
  return { store, runs, logs, mk, set: (iso: string) => { now = Date.parse(iso); } };
}

test('runs once per slot at the configured time — not before, not twice, not on a second instance; only listed, installed jobs', async () => {
  const s = sched(); const a = s.mk(), b = s.mk();
  assert.deepEqual(await a.tick(), [], 'before 5 PM: yesterday\'s slot is outside its 6-hour window');
  s.store.runs.length = 0; s.runs.length = 0;
  s.set('2026-11-23T22:00:30Z'); assert.deepEqual(await a.tick(), ['apsDailyForceSync']); await new Promise((r) => setImmediate(r));
  assert.deepEqual(await b.tick(), [], 'second instance'); assert.deepEqual(await a.tick(), [], 'same slot');
  s.set('2026-11-24T03:00:00Z'); assert.deepEqual(await a.tick(), []);
  assert.equal(s.runs.length, 1); assert.match(s.logs.join('\n'), /apsDailyForceSync \(fixed time\) ran on Azure's timetable: ok/);
  s.set('2026-11-24T22:01:00Z'); assert.deepEqual(await a.tick(), ['apsDailyForceSync'], 'next day');
  const off = sched({ installed: false }); off.set('2026-11-23T22:01:00Z'); assert.deepEqual(await off.mk().tick(), [], 'trigger not installed in Apps Script → off');
  const notListed = sched({ onAzure: [] }); notListed.set('2026-11-23T22:01:00Z'); const n = notListed.mk(); assert.deepEqual(await n.tick(), []);
  assert.match(notListed.logs.join('\n'), /NOT in Apps Script APS_JOBS_ON_AZURE/);
});

test('a start inside the window catches up once (the job bodies guard their own slot); after the window nothing is sent late', async () => {
  const s = sched(); s.set('2026-11-24T01:30:00Z'); assert.deepEqual(await s.mk().tick(), ['apsDailyForceSync'], '3.5 h after 5 PM, within 6 h');
  const late = sched(); late.set('2026-11-24T04:30:00Z'); assert.deepEqual(await late.mk().tick(), [], '6.5 h after → no');
});

const GAS = path.resolve(__dirname, '..', '..', 'gas-source'); const have = fs.existsSync(path.join(GAS, 'AzureBridge.gs'));
test('real Apps Script (r141): schedule from the same settings as the triggers; the trigger skips while Azure is alive, takes over when not — and then Azure\'s run of that slot is refused', { skip: !have && 'gas-source not found' }, async () => {
  const SECRET = 't'.repeat(64);
  const { makeContext } = require(path.join(GAS, 'test', 'gasmock'));
  const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET, APS_DAILY_SYNC_HOUR: '16', APS_CLASS_TEACHER_AVAILABILITY_HOUR: '19', APS_CLASS_TEACHER_AVAILABILITY_TIMEZONE: 'America/Chicago' } });
  env.ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
  env.ctx.Utilities.getUuid = () => crypto.randomUUID();
  const triggers = ['apsDailyForceSync', 'sendWeeklyClassTeacherAvailabilityReport', 'apsPtaCoverageNotifyFriday'].map((h) => ({ getHandlerFunction: () => h, getUniqueId: () => 'T-' + h }));
  env.ctx.ScriptApp.getProjectTriggers = () => triggers; env.ctx.ScriptApp.deleteTrigger = () => {};
  vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map((f) => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
  const G: any = env.ctx; let syncs = 0; G.syncClassroomData_ = () => { syncs++; return { synced: syncs }; }; G.apsPropHealth_ = () => {};
  const fetchImpl: any = async (_u: string, init: { body: string }) => { const t = env.ctx.doPost({ postData: { contents: init.body } }).getContent(); return { ok: true, status: 200, text: async () => t, json: async () => JSON.parse(t) }; };
  const URL = 'https://script.google.com/macros/s/T/exec';
  const sch = await bridgeScheduleSource(URL, SECRET, fetchImpl)();
  assert.equal(sch.jobs.length, 12);
  const by = Object.fromEntries(sch.jobs.map((j) => [j.handler, j]));
  assert.deepEqual([by.apsDailyForceSync.hour, by.apsDailyForceSync.tz, by.apsDailyForceSync.installed], [16, NY, true]);
  assert.deepEqual([by.sendWeeklyClassTeacherAvailabilityReport.hour, by.sendWeeklyClassTeacherAvailabilityReport.tz], [19, 'America/Chicago']);
  assert.deepEqual([by.apsPtaCoverageNotifyFriday.kind, by.apsPtaCoverageNotifyFriday.weekday, by.apsPtaCoverageNotifyFriday.hour, by.apsPtaCoverageNotifyFriday.minute], ['weekly', 5, 17, 30]);
  assert.equal(by.apsDailySummaryReport.installed, false, 'its trigger is not installed here → Azure leaves it alone');
  assert.deepEqual(sch.onAzure, []);
  const run = bridgeJobRunner(URL, SECRET, fetchImpl, Date.now, async () => {});
  assert.match((await run('apsDailyForceSync', crypto.randomUUID())).summary, /NOT_ON_AZURE/);
  env.props.APS_JOBS_ON_AZURE = 'apsDailyForceSync,processExamQuestionPaperAutoEmail';
  assert.deepEqual(await run('apsDailyForceSync', crypto.randomUUID()), { ok: true, summary: '{"synced":1}' }, 'Azure runs the real handler');
  // Azure alive (it just ran a job) → the trigger skips
  assert.deepEqual(JSON.parse(JSON.stringify(G.apsDailyForceSync({ triggerUid: 'T-apsDailyForceSync' }))), { skipped: 'ON_AZURE' }); assert.equal(syncs, 1);
  // Azure silent for 31 minutes → the trigger runs it and marks the take-over; Azure's run of the same slot is refused
  Object.keys(env.props).filter((k) => k.startsWith('APS_AZURE_JOB_LAST_')).forEach((k) => { env.props[k] = String(Date.now() - 31 * 60000); });
  G.apsDailyForceSync({ triggerUid: 'T-apsDailyForceSync' }); assert.equal(syncs, 2);
  assert.deepEqual(await run('apsDailyForceSync', crypto.randomUUID()), { ok: true, summary: '{"skipped":"RAN_BY_TRIGGER"}' }); assert.equal(syncs, 2, 'never twice');
  assert.throws(() => G.apsDailyForceSync({ triggerUid: 'FAKE' }), /Access denied/);
  assert.match((await run('apsZohoDailySync', crypto.randomUUID())).summary, /BAD_REQUEST/);
});

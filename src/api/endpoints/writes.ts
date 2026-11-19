/**
 * Write phase step 1 (v0.10.0) — Admin settings saves.
 *
 * Azure does not write Apps Script's stores itself. A Save pressed on the Azure dashboard is sent through the signed
 * bridge (AzureBridge.gs r132, action "call") and the REAL Code.gs function runs in Apps Script for the signed-in
 * person — same validation, permission checks (Admin only, Access Control tab, read-only roles), locks and audit.
 * Apps Script decides the person's role from the e-mail itself; Azure only sends its verified session e-mail.
 *
 *  - Only the functions in WRITE_THROUGH (the SAME list as AZURE_BRIDGE_CALLS_ in AzureBridge.gs; the test fails if
 *    they differ). Same names and arguments as google.script.run, so the page is unchanged.
 *  - After a successful save, Azure's cached reads (live snapshot, Sheets) are refreshed, so the page shows the change.
 *  - App setting AZURE_WRITE_THROUGH=off (or no bridge) → the old "not on Azure yet" answer.
 */
import type { Registry } from '../registry';
import { NOT_ON_AZURE } from '../registry';
import { requireSession } from '../../app/context';
import { bridgeCall, bridgeUsable, type FetchLike } from '../../live/liveSource';
import { SC_OWNED_FNS, scOwnedByAzure, runOwnedSave } from '../../db/scOwner';

export const WRITE_THROUGH: string[] = [
  'saveAccessControl', 'saveAssignmentMonitoringConfig', 'saveMissingGradingConfig', 'saveMarkCompleteSettings',
  'saveTeacherAppreciationConfig', 'setTeacherAppreciationEmails', 'saveSpecialClassesSettings', 'saveTicketSettings',
  'setExamQuestionPaperDefaults', 'setExamQuestionPaperAutoEmail', 'setRosterHiddenStaffVisible',
  // v0.13.0: teacher class-card actions (Mark Live, Teacher NOT in Class, Needs Tech Support, availability, class status)
  'setLiveStatus', 'setTeacherNotInClassStage', 'setNeedsTechSupportStage', 'setTeacherAvailabilityStatus', 'setClassStatusManual',
  // v0.13.0: Special Classes programs — forwarded while Apps Script owns them; saved in Azure SQL when SC_OWNER=azure (src/db/scOwner.ts)
  'saveSpecialClass', 'setSpecialClassActive',
];

/**
 * Phase 2 completion (v0.12.0) — READ-THROUGH: the read screens Azure cannot read itself yet (they need Classroom,
 * Drive, Zoho, script locks …) run in Apps Script the same way (AZURE_BRIDGE_READS_ in AzureBridge.gs r133 — same list,
 * tested). Nothing is cached or refreshed afterwards. Ported natively one by one later; then they leave this list.
 * Not here: chat (polled often), the exam download / preview ticket protocol (Apps Script caches + Promise).
 */
export const READ_THROUGH: string[] = [
  'checkZohoConnection', 'exportExamQuestionPaperAudit', 'exportGrading', 'getAddStudentContext', 'getAdminWebAppDeploymentInfo',
  'getAssignmentMonitoringAdmin', 'getExamQuestionPaperContext', 'getExaminationCourseOptions', 'getGradingData',
  'getMaintenanceStatus', 'getMeetPreviewData', 'getMissingGradingAdmin', 'getTamilThadam', 'getTeacherAppreciationData',
  'getTicketAttachment', 'getZohoFieldMapping', 'getZohoSyncStatus', 'previewExaminationAnnouncement',
  'previewExaminationClasswork', 'previewZohoStudentSync', 'searchExaminationAnnouncement',
];
export const THROUGH_TIMEOUT_MS = 120_000;

export function registerWrites(reg: Registry, fetchImpl?: FetchLike): void {
  for (const name of READ_THROUGH) registerThrough(reg, name, false, fetchImpl);
  for (const name of WRITE_THROUGH) registerThrough(reg, name, true, fetchImpl);
}

function registerThrough(reg: Registry, name: string, isWrite: boolean, fetchImpl?: FetchLike): void {
  {
    reg.register(name, async (ctx, args) => {
      const s = await requireSession(ctx, args[0]);
      if (isWrite && SC_OWNED_FNS.indexOf(name) > -1 && scOwnedByAzure(ctx)) return runOwnedSave(ctx, s, String(args[0]), name, args.slice(1)); // stage 3
      if (!ctx.cfg.writeThroughEnabled || !bridgeUsable(ctx.cfg)) throw new Error(NOT_ON_AZURE + name);
      const rest = args.slice(1);
      if (JSON.stringify(rest).length > 90_000) throw new Error('This change is too large to save in one go.');
      let r: any;
      try { r = await bridgeCall(ctx.cfg.appsScriptBridgeUrl, ctx.cfg.appsScriptBridgeSecret, { action: 'call', v: 1, fn: name, args: rest, email: s.email }, fetchImpl || (fetch as unknown as FetchLike), Date.now, THROUGH_TIMEOUT_MS); }
      catch (e) {
        console.warn((isWrite ? '[Write] ' + name + ' not saved: ' : '[Read] ' + name + ' not answered: ') + String((e as Error).message || e).slice(0, 80));
        throw new Error(isWrite ? 'The change could not be saved right now (the APS Dashboard did not answer). Please try again in a minute.'
          : 'This screen could not be loaded right now (the APS Dashboard did not answer). Please try again in a minute.');
      }
      if (r && typeof r.error === 'string') throw new Error(r.error);
      if (isWrite) { ctx.live.invalidate?.(); ctx.data.invalidate?.(); }
      return r ? r.value : null;
    });
  }
}

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
import { responseCache } from '../responseCache';
import type { Registry } from '../registry';
import { NOT_ON_AZURE } from '../registry';
import { requireSession } from '../../app/context';
import { bridgeCall, bridgeUsable, type FetchLike } from '../../live/liveSource';
import { SC_OWNED_FNS, scOwnedByAzure, runOwnedSave } from '../../db/scOwner';
import { ownedChatList, ownedChatPost } from '../../db/chatOwner';

export const WRITE_THROUGH: string[] = [
  // v0.10.0 Admin settings; v0.13.0 teacher class-card actions + Special Classes; v0.14.0 every remaining dashboard action
  'saveAccessControl', 'saveAssignmentMonitoringConfig', 'saveMissingGradingConfig', 'saveMarkCompleteSettings', 'saveTeacherAppreciationConfig', 'setTeacherAppreciationEmails',
  'saveSpecialClassesSettings', 'saveTicketSettings', 'setExamQuestionPaperDefaults', 'setExamQuestionPaperAutoEmail', 'setRosterHiddenStaffVisible', 'setLiveStatus',
  'setTeacherNotInClassStage', 'setNeedsTechSupportStage', 'setTeacherAvailabilityStatus', 'setClassStatusManual', 'saveSpecialClass', 'setSpecialClassActive',
  'acceptStudentLoginNotice', 'addSpecialClassEnrollments', 'addStudentToClassroom', 'addTicketParticipant', 'amAdminAction', 'applyCoverage',
  'assignStudentToClassroom', 'assignTicket', 'attachExamQuestionPaperLink', 'autoMapCourseMeetLinks', 'bulkOverrideAttendance', 'cancelAddStudentRequest',
  'cancelMyClassChangeRequest', 'cancelZohoSyncJob', 'createTempTeacherAssignment', 'createTicket', 'deleteDashboardUserRole', 'downloadExamQuestionPaper',
  'downloadExamQuestionPaperTeacherCopy', 'editAttendanceRecordStatus', 'fetchExamQuestionPaperDownload', 'forceSyncAttendanceNow', 'forceSyncClassroomData', 'generateAnnouncementId',
  'postChatMessage', 'previewExamQuestionPaper', 'rebuildExamQuestionPaperSummary', 'recordGoogleReviewEvent', 'recordMeetJoinClick', 'recordViewerCountry',
  'refreshClassMeetLiveStatus', 'removeStudentFromClassroom', 'removeTicketParticipant', 'replyTicket', 'retryCoverage', 'retryLeaveNotification',
  'retryRemovalEmail', 'retryTeacherAppreciationFailed', 'runAuditArchiveNow', 'runSystemBackupNow', 'runTeacherAppreciationNow', 'runTempDataCleanup',
  'saveClassCoverage', 'saveCourseMeetLinkMapping', 'saveDashboardUserRole', 'saveExamQuestionPaper', 'saveZohoFieldMapping', 'saveZohoSyncSchedule',
  'sendExamQuestionPaperToAllEligible', 'sendExamQuestionPaperToStudent', 'sendMissingGradingNow', 'sendWeeklyClassTeacherAvailabilityTestEmail', 'setExamQuestionPaperStatus', 'setMyDefaultCountry',
  'setUserCountryByAdmin', 'startZohoSyncJob', 'stepZohoSyncJob', 'submitAdminInitiatedReferenceLetter', 'submitClassTeacherAvailability', 'submitGradeChangeRequest',
  'submitLeaveRequest', 'submitParentFeedback', 'submitReferenceLetterRequest', 'submitTimingChangeRequest', 'submitUserIdea', 'syncGrading',
  'testZohoFieldMapping', 'updateSpecialClassEnrollment', 'updateTicket',
];

/**
 * Phase 2 completion (v0.12.0) — READ-THROUGH: the read screens Azure cannot read itself yet (they need Classroom,
 * Drive, Zoho, script locks …) run in Apps Script the same way (AZURE_BRIDGE_READS_ in AzureBridge.gs r133 — same list,
 * tested). Nothing is cached or refreshed afterwards. Ported natively one by one later; then they leave this list.
 * Not here: chat (polled often), the exam download / preview ticket protocol (Apps Script caches + Promise).
 */
export const READ_THROUGH: string[] = [
  'checkZohoConnection', 'exportExamQuestionPaperAudit', 'exportGrading', 'getAddStudentContext', 'getAdminWebAppDeploymentInfo', 'getAssignmentMonitoringAdmin',
  'getExamQuestionPaperContext', 'getExaminationCourseOptions', 'getGradingData', 'getMaintenanceStatus', 'getMeetPreviewData', 'getMissingGradingAdmin',
  'getTamilThadam', 'getTeacherAppreciationData', 'getTicketAttachment', 'getZohoFieldMapping', 'getZohoSyncStatus', 'previewExaminationAnnouncement',
  'previewExaminationClasswork', 'previewZohoStudentSync', 'searchExaminationAnnouncement', 'getChatMessages', 'getMyExamQuestionPapers', 'getWeeklyPanelData',
  'resolveTicketStudent',
];
/** v0.14.0: Azure's front door ends a browser request after ~230 s, so Azure gives up at 220 s. Apps Script keeps going
 *  (≤ 6 minutes) and the action still completes there. */
export const THROUGH_TIMEOUT_MS = 220_000;
export const RESULT_POLL_MS = 1500;
/** v0.14.0: actions that carry uploads (base64): up to 24 MB; every other action up to 1 MB. */
export const UPLOAD_FNS = ['createTicket', 'replyTicket', 'updateTicket', 'saveExamQuestionPaper', 'attachExamQuestionPaperLink', 'submitUserIdea'];
/** v0.14.0: frequent, light actions that change no Sheet data Azure caches — only the live snapshot is refreshed after them. */
export const LIGHT_FNS = ['recordViewerCountry', 'recordGoogleReviewEvent', 'recordMeetJoinClick', 'acceptStudentLoginNotice', 'postChatMessage',
  'submitUserIdea', 'submitParentFeedback', 'generateAnnouncementId', 'fetchExamQuestionPaperDownload', 'downloadExamQuestionPaper',
  'downloadExamQuestionPaperTeacherCopy', 'previewExamQuestionPaper', 'testZohoFieldMapping', 'stepZohoSyncJob'];
export const MAX_ARGS_TEXT = 1_000_000, MAX_UPLOAD_TEXT = 24_000_000;
/** Kept on Azure on purpose: role permissions are Azure's own (Key Vault ROLE_PERMISSIONS_JSON); a save in Apps Script would
 *  not change what Azure enforces, so Azure refuses with the way to change them. */
export const ROLE_PERMISSIONS_MSG = 'Role permissions for the Azure dashboard are kept in Azure Key Vault. Change them in the APS Dashboard (Apps Script), then ask the technical owner to run tools/push-role-lists-to-keyvault.ps1.';

export function registerWrites(reg: Registry, fetchImpl?: FetchLike, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), now: () => number = Date.now): void {
  for (const name of READ_THROUGH) registerThrough(reg, name, false, fetchImpl, sleep, now);
  for (const name of WRITE_THROUGH) registerThrough(reg, name, true, fetchImpl, sleep, now);
  reg.register('saveDashboardRolePermissions', async (ctx, args) => { await requireSession(ctx, args[0]); throw new Error(ROLE_PERMISSIONS_MSG); });
}

function registerThrough(reg: Registry, name: string, isWrite: boolean, fetchImpl: FetchLike | undefined, sleep: (ms: number) => Promise<void>, now: () => number): void {
  reg.register(name, async (ctx, args) => {
    const s = await requireSession(ctx, args[0]);
    if (isWrite && SC_OWNED_FNS.indexOf(name) > -1 && scOwnedByAzure(ctx)) return runOwnedSave(ctx, s, String(args[0]), name, args.slice(1)); // stage 3
    if (ctx.cfg.chatOwner === 'azure' && name === 'getChatMessages') return ownedChatList(ctx, s); // v0.16.0: chat owned by Azure SQL
    if (ctx.cfg.chatOwner === 'azure' && name === 'postChatMessage') return ownedChatPost(ctx, s, args[1]);
    if (!ctx.cfg.writeThroughEnabled || !bridgeUsable(ctx.cfg)) throw new Error(NOT_ON_AZURE + name);
    const rest = args.slice(1);
    if (JSON.stringify(rest).length > (UPLOAD_FNS.indexOf(name) > -1 ? MAX_UPLOAD_TEXT : MAX_ARGS_TEXT)) throw new Error('This is too large to send in one go (files must be smaller than the limit shown on the screen).');
    const f = fetchImpl || (fetch as unknown as FetchLike), url = ctx.cfg.appsScriptBridgeUrl, secret = ctx.cfg.appsScriptBridgeSecret;
    const deadline = now() + THROUGH_TIMEOUT_MS;
    const fail = (e: unknown, stage: string): never => {
      const code = String((e as Error).message || e).slice(0, 80);
      console.warn((isWrite ? '[Write] ' + name + ' not saved: ' : '[Read] ' + name + ' not answered: ') + code + (stage ? ' (' + stage + ')' : ''));
      if (code === 'TIMEOUT' && isWrite) throw new Error('This is taking longer than usual. It is still running in the APS Dashboard — please check the result in a few minutes before trying again.');
      throw new Error(isWrite ? 'The change could not be saved right now (the APS Dashboard did not answer). Please try again in a minute.'
        : 'This screen could not be loaded right now (the APS Dashboard did not answer). Please try again in a minute.');
    };
    let r: any;
    try { r = await bridgeCall(url, secret, { action: 'call', v: 1, fn: name, args: rest, email: s.email }, f, Date.now, Math.max(1000, deadline - now())); }
    catch (e) { fail(e, ''); }
    // v0.14.0: a Promise-answering function (PDF preview / download / send) — collect the result when it is ready
    while (r && typeof r.pending === 'string') {
      if (now() + RESULT_POLL_MS > deadline) fail(new Error('TIMEOUT'), 'waiting for the result');
      await sleep(RESULT_POLL_MS);
      let q: any;
      try { q = await bridgeCall(url, secret, { action: 'result', v: 1, job: r.pending, email: s.email }, f, Date.now, Math.max(1000, Math.min(30_000, deadline - now()))); }
      catch (e) { fail(e, 'result'); }
      if (q && q.pending === true) continue;
      r = q;
    }
    if (r && typeof r.error === 'string') throw new Error(r.error);
    if (isWrite) { ctx.live.invalidate?.(); if (LIGHT_FNS.indexOf(name) < 0) ctx.data.invalidate?.(s.email); responseCache.clear(); } // v0.24.0: reused answers cleared at once
    return r ? r.value : null;
  });
}

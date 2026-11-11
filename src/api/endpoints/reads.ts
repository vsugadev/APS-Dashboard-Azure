/**
 * Phase 2 step 6 — the remaining READ-ONLY browser calls, each the copied Code.gs function with its own role checks
 * (tools/gen-gas-scope.js 'reads2'; chosen by dependency analysis: no Classroom, Drive, Zoho/HTTP, Gmail, triggers,
 * locks or Script Property writes). Run in the read-only runtime with on-demand sheet loading (src/gas/run.ts).
 * Buttons on these screens that SAVE / SEND / SYNC still call Apps Script-only functions → 'not on Azure yet'.
 */
import type { Registry } from '../registry';
import { requireSession } from '../../app/context';
import { gasRun } from './classes';

/** By tab (for docs and tests). */
export const READS2: Record<string, string[]> = {
  'Teacher Appreciation': [
    'exportTeacherAppreciation',
    'getAppreciationLetterAudit',
    'getTeacherAppreciationAdminReport',
    'getTeacherAppreciationEmailPreview',
    'getTeacherAppreciationHistory',
    'previewTeacherAppreciation'
  ],
  'Admin Control': [
    'exportUserCountry',
    'getAccessControlHistory',
    'getAuthorizedEmailsForGroupSync',
    'getCacheSheetUrl',
    'getCourseMeetLinkMappings',
    'getDashboardRolePermissions',
    'getDashboardUserRoles',
    'getRemovalContext',
    'getUserCountryAdmin'
  ],
  'Assignments / Grading help / Class change': [
    'getAdminAssignmentAuditLog',
    'getAdminClassroomAssignments',
    'getAssignmentHealthCard',
    'getAssignmentMonitoring',
    'getAssignmentMonitoringClass',
    'getAssignmentMonitoringHistory',
    'getClassChangeContext',
    'getClassChangeRequestsForApprover',
    'getGradeChangeApproverInfo',
    'getGradeChangeTimingOptions',
    'getMyClassChangeRequests',
    'previewMissingGrading'
  ],
  'Leave': [
    'getApplyLeaveData',
    'getSchoolLeaveAdminData',
    'getSchoolLeaveHistory'
  ],
  'General': [
    'getAuthenticatedAPSUser',
    'getCourseNameSuffix',
    'getKnowledgeBaseVideos',
    'getLastSyncError',
    'getLastSyncInfo',
    'getShowContactPhone',
    'getStudentLoginNoticeStatus'
  ],
  'Coverage': [
    'getClassCoverageHistory',
    'getClassCoverageTracking',
    'getCoverageBootstrap',
    'getCoveragePlan'
  ],
  'Examination': [
    'getExamQuestionPaperAuditLog',
    'getExamQuestionPaperMonitoring',
    'getExamQuestionPaperPublishPreview',
    'getExaminationHistory'
  ],
  'Reference letters': [
    'getMyReferenceLetterRequests',
    'getReferenceLetterAccessInfo',
    'getReferenceLetterRequestsForApprover'
  ],
  'Special Classes': [
    'getSpecialClassEnrollments',
    'getSpecialClasses',
    'getSpecialClassesAdmin'
  ],
  'Temp Teacher': [
    'getTempTeacherData'
  ],
  'Tickets': [
    'getTicket',
    'getTicketBootstrap',
    'getTicketReports',
    'getTicketSettings',
    'listTickets',
    'searchTicketStudents'
  ],
  'Zoho (status / history only)': [
    'getZohoSyncHistory',
    'getZohoSyncJob',
    'loadZohoSyncStudents'
  ],
  'Tamil Thadam': [
    'searchTamilThadamStudents'
  ]
};

export function registerReads2(reg: Registry): void {
  for (const name of Object.values(READS2).flat()) {
    reg.register(name, async (ctx, [token, ...args]) => {
      const s = await requireSession(ctx, token);
      return gasRun(ctx, { email: s.email, role: s.role }, (S) => S[name](token, ...args));
    });
  }
}

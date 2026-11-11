#!/usr/bin/env node
/**
 * Copies the Code.gs Sheet-READER functions used by the Azure Classes view, word for word, into
 * src/gas/scope.generated.ts as one factory: makeGasScope(rt) — a fresh copy of their module state per request.
 * They run against src/gas/runtime.ts: a READ-ONLY Apps Script environment (Sheets snapshot read through the
 * Sheets API, no cache, settings from App Service). Every name the copied code uses must be either copied here or
 * provided by the runtime — the tool stops with the list otherwise, so nothing can silently be missing.
 *   npm run gen-gas      (with gen-gas-helpers.js)          npm test checks the file is current
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'gas-source', 'Code.gs');
const OUT = path.join(ROOT, 'src', 'gas', 'scope.generated.ts');

// Feature → Code.gs functions (copied whole). Keep in step with docs/PHASE2.md.
const FEATURES = {
  shared: ['extractMeetCode_', 'ctaSheet_', 'rosterTs_', 'normalizeEmail_', 'naturalCompareJs_', 'isAdminOrHm_', 'isAdminRole_', 'apsReqMemo_', 'rosterProp_', 'countryCodeToFlagServer_', 'resolveCountryFlag_'],
  availability: ['getCurrentWeekId_', 'easternDayOfWeek_', 'easternWallTimeToDate_', 'readTeacherAvailabilityMap_', 'getOrCreateTeacherAvailabilitySheet_', 'buildAvailabilityBoard_', 'primaryTeacherOf_'],
  whatsapp: ['getWhatsAppLinksMap_', 'getWhatsAppLinksMapFromSheet_', 'getOrCreateWhatsAppLinksSheet_', 'applyWhatsAppLinks_', 'normalizeClassKey_'],
  meet: ['applyMeetLinks_', 'classMeetLinkMaps_', 'classMeetUrl_', 'classMeetJoinUrl_', 'attNormalizeMeetCode_'],
  schoolLeave: ['getAPSSchoolLeaveStatus', 'slCovering_', 'slEnabled_', 'slDateStr_', 'apsSchoolLeaves_', 'slReadAll_', 'slSheet_', 'dsShift_', 'dsDateParts_'],
  coverage: ['tccStampToday_', 'tccCoverageMap_', 'tccRows_', 'tccGraceMinutes_', 'tccCanUse_', 'courseHasSupportEmail_'],
  tempTeacher: ['ttmStampCards_', 'ttmCardMap_', 'ttmRows_', 'ttmToday_', 'ttmFmtDate_', 'ttmCanUse_', 'ttmIsCoordinator_'],
  attendance: ['getAttendanceCourseAwkMap', 'defaultDashboardRolePermissions_', 'getEffectiveClassMinutes', 'attAttendedPct_', 'attScoreForPct_', 'attStatusForScore_', 'readDashboardRolePermissionsRaw_', 'attApplyClassDurationRule_', 'getConfigString_', 'readDashboardRolePermissions_', 'attColumnLetter_', 'attRowToRecord_', 'attReadSheetRecords_', 'attWeekIdForDateStr_', 'attShiftDateStr_', 'getDashboardRolePermission_', 'attSummaryKey_', 'attStudentOverallKey_', 'attSummaryOverall_', 'attWeekSheetNameForDate_', 'attReadRecordsForSheets_', 'attEffectiveScore_', 'ensureSheetHeader_', 'getAttendanceWeek1Start_', 'attListWeekSheets_', 'attWeekIdForNumber_', 'classSupportElevated_', 'courseHasStudentEmail_', 'requireDashboardMutationPermission_', 'readAttendanceSummaryMap_', 'getAPSIdFromEmail', 'attReadRecordsForFilters_', 'attOverallFor_', 'attCompareRecords_', 'attCountedMinutes_', 'attWeekNumberForWeekId_', 'formatAwkSheetName_', 'getOrCreateAttendanceAuditLogSheet_', 'attCellToText_', 'getAttendanceRecordsForViewer', 'getOnCallTeacherAttendance', 'getAttendanceWeekOptions', 'getAttendanceAuditLog', 'getAttendanceSyncDiagnostics', 'getAttendanceLastSyncInfo'],
  directory: ['getDirectoryIndex', 'classSupportGrantsAccess_', 'userHasCourseAccess_', 'directoryTierForRole_', 'applyNilaiAndClassTimeFilters_'],
  teacherAvailability: ['getClassTeacherAvailabilityView', 'attOnCallPrefixes_', 'parseClockTime_', 'inferMissingMeridiem_', 'attIsOnCallEmail_', 'getConfigList_', 'isSyntacticallyValidEmail_', 'slAudit_', 'parseCourseSchedule_', 'attIsExcludedEmail_', 'normalizeClassTimeText_', 'ctaProp_', 'attMailAdminCc_', 'attMailCc_', 'apsMailProfile_', 'extractAPSID_', 'apsLeaveSkip_', 'apsClassDateInWeek_', 'examQpParseClassName_', 'readConfiguredUserRoles_', 'ctaExcludeRule_', 'ctaExcluded_', 'isHiddenTeacherName_', 'extractNilaiFromCourseName_', 'extractClassTimeFromCourseName_', 'ctaRoleFlags_', 'ctaConfig_', 'getWeekLabel_', 'ctaNilaiOptions_', 'ctaTimeOptions_', 'isReadOnlyRole_', 'apsMailFrom_', 'ctaReadSelections_', 'findDisplayName_', 'localPartOfEmail_', 'ctaApsId_', 'ctaAyMatch_', 'courseHasTeacherEmail_', 'ctaFmtTs_', 'ctaBuildReport_',],
  country: ['applyUserCountry_', 'getUserCountryMap_', 'ucLegacyMap_', 'ucMap_', 'ucRows_', 'ucSheet_', 'ucPref_', 'apsCountryOn_'],
};
// Module-level vars copied (constants, memo state). Initialisers run per request inside the factory.
const VARS = (process.env.GEN_VARS || '').split(',').filter(Boolean).concat([
  'APS_REQ_MEMO_', 'LAST_LOGIN_TIMEZONE', 'APS_TZ', 'AVAILABILITY_STATUS', 'TEACHER_AVAILABILITY_SHEET_NAME', 'WHATSAPP_LINKS_SHEET_NAME',
  'CLASS_MEET_CACHE_KEY_', 'ATTENDANCE_MEET_LINK_MAP_SHEET_NAME', 'CLASS_MEET_DETECTED_SHEET_',
  'SL_MEMO_', 'SL_CACHE_KEY_', 'SL_SHEET_', 'SL_HEADER_', 'SL_STATUS_',
  'TCC_CACHE_KEY_', 'TCC_SHEET_', 'TCC_HEADER_', 'TTM_CARD_CACHE_', 'TTM_SHEET_', 'TTM_HEADER_',
  'UC_SHEET_', 'UC_HEADER_', 'UC_CACHE_KEY_', 'UC_MEMO_', 'SUPERADMIN_ROLE', 'VCFO_AMCHSTS_BOD_ROLE', 'ATTENDANCE_EFFECTIVE_CAP_FROM_MIN', 'ATTENDANCE_EFFECTIVE_CAP_MIN', 'ATTENDANCE_SCORE_TIERS_', 'ATTENDANCE_STATUS', 'ROLE_PERMISSION_CACHE_KEY', 'ROLE_PERMISSION_PROP_KEY', 'ROLE_PERMISSION_CACHE_SECONDS', 'ATTENDANCE_COL_', 'ATTENDANCE_HEADER_ROW', 'ATTENDANCE_SPREADSHEET_ID', 'ATTENDANCE_OVERRIDE_SCORES_', 'ATTENDANCE_WEEK1_START_DEFAULT_', 'ATTENDANCE_WEEK_SHEET_PATTERN_', 'ATTENDANCE_SUMMARY_SHEET_NAME', 'ATTENDANCE_SUMMARY_HEADER_ROW', 'ATTENDANCE_SHEET_PREFIX', 'ATTENDANCE_AUDIT_LOG_SHEET_NAME', 'ATTENDANCE_ROLE', 'ATTENDANCE_SOURCE', 'ATTENDANCE_AUDIT_LOG_HEADER_ROW', 'ATTENDANCE_SYNC_DIAGNOSTIC_KEY', 'ATTENDANCE_LAST_SYNC_SUMMARY_KEY', 'AUTHORIZED_ROLE', 'EXAM_QP_DAY_TOKENS_', 'ATTENDANCE_ON_CALL_PREFIXES_MEMO_', 'ATTENDANCE_ON_CALL_PREFIXES_DEFAULT_', 'SL_AUDIT_SHEET_', 'SL_AUDIT_HEADER_', 'CLASS_SCHEDULE_DAY_TOKENS', 'ATTENDANCE_EXCLUDED_MEMO_', 'ADMIN_EMAILS', 'HEADMASTER_EMAILS', 'ATTENDANCE_ALWAYS_EXCLUDED_EMAILS_', 'VCFO_AMCHATS_BOD_EMAILS', 'ATTENDANCE_MAIL_ADMIN_CC_DEFAULT_', 'APS_MAIL_PROFILES_', 'USER_ROLE_CACHE_KEY', 'USER_ROLE_SHEET_NAME', 'USER_ROLE_CACHE_SECONDS', 'DASHBOARD_ROLES', 'SUPERADMIN_EMAILS', 'CTA_EXCLUDE_ROLES_', 'APS_GRADING_TEAM_EMAILS_', 'HIDDEN_TEACHER_NAMES', 'HIDDEN_TEACHER_NAME_PREFIXES', 'HIDDEN_TEACHER_EMAIL_PREFIXES', 'CTA_DEFAULT_TO_', 'NILAI_FILTER_OPTIONS', 'CLASS_TIME_FILTER_OPTIONS', 'CTA_SELECTION_SHEET_', 'CTA_SELECTION_HEADER_', 'CTA_LABEL_', 'CTA_CODE_TO_LABEL_', 'CTA_DAY_NAMES_', 'COURSE_NAME_SUFFIX',
]);
// Supplied by src/gas/runtime.ts (Apps Script services, workbooks, Azure-side ports).
const PROVIDED = ['Sheets', 'SpreadsheetApp', 'CacheService', 'PropertiesService', 'Utilities', 'Session', 'console', 'getWorkbook_', 'getAttendanceWorkbook_',
  'isRosterHiddenStaffEmail_', 'apsTabAllowed_', 'isOnCallCoordinatorEmail_', 'apsRequireTabForToken_', 'requireValidSession_', 'readAllCoursesFromCache_',
  // live-data passes (Script / User Properties — Phase 3): Azure's versions with no stored maps, same as the Classes view
  'applyRosterHiddenStaffFilter_', 'applyLivePresence_', 'applyLastLogin_', 'applyStudentOnboardedFlag_'];
// Writers that may be reached but are wrapped in try/catch in Code.gs (best-effort audit) — allowed: the runtime refuses the write.
// (slAudit_ appends to APS_SCHOOL_LEAVE_AUDIT_LOG; Azure does not write it.)
// Apps Script globals: any the copied code uses must be provided by the runtime (checked — nothing can be undefined).
const APPS_SCRIPT_GLOBALS = ['Sheets', 'SpreadsheetApp', 'CacheService', 'PropertiesService', 'Utilities', 'Session', 'Logger', 'HtmlService', 'ContentService', 'Drive', 'People', 'Gmail', 'Calendar', 'XmlService', 'Charts', 'Maps', 'Classroom', 'ScriptApp', 'UrlFetchApp', 'DriveApp', 'GmailApp', 'MailApp', 'LockService', 'AdminDirectory', 'AdminReports'];
const FORBIDDEN_CALLS = /ScriptApp|Classroom\.|UrlFetchApp|GmailApp|MailApp|DriveApp|LockService|AdminDirectory|AdminReports|\.setProperty|\.deleteProperty/;

/** True when a '/' at position j starts a regex literal (not division): previous non-space char is an operator/bracket or a keyword. */
function regexStart(src, j) {
  let k = j - 1; while (k >= 0 && /\s/.test(src[k])) k--;
  if (k < 0) return true;
  if ('(,=:[!&|?{};+-*%<>~^'.includes(src[k])) return true;
  const w = src.slice(Math.max(0, k - 9), k + 1).match(/[A-Za-z_$]+$/);
  return !!w && /^(return|typeof|case|do|else|in|of|void|throw|delete|new)$/.test(w[0]);
}
/** Index just after a regex literal starting at j (handles escapes and [...] classes). */
function skipRegex(src, j) {
  let inClass = false;
  for (let i = j + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') inClass = true; else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i;
    else if (c === '\n') return j; // not a regex after all
  }
  return j;
}

function blockAt(src, i) {
  const isF = src.startsWith('function ', i); let d = 0, q = null, seen = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (q) { if (c === q && p !== '\\') q = null; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '/' && regexStart(src, j)) { j = skipRegex(src, j); continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('{(['.includes(c)) { d++; seen = true; }
    else if ('})]'.includes(c)) { d--; if (d === 0 && seen && c === '}' && isF) return src.slice(i, j + 1); }
    else if (c === ';' && d === 0 && !isF) return src.slice(i, j + 1);
  }
  throw new Error('unterminated block at ' + i);
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");

function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  const defs = {}; let m;
  const reF = /^function ([A-Za-z_$][\w$]*)\s*\(/gm; while ((m = reF.exec(src))) defs[m[1]] = m.index;
  const reV = /^(?:var|const|let) ([A-Za-z_$][\w$]*)\s*=/gm; while ((m = reV.exec(src))) if (!(m[1] in defs)) defs[m[1]] = m.index; // every top-level name
  const fns = Array.from(new Set(Object.values(FEATURES).flat()));
  const copied = new Set(fns.concat(VARS)), provided = new Set(PROVIDED), parts = [], missing = {};
  for (const v of VARS) { if (!(v in defs)) throw new Error('var not found in Code.gs: ' + v); parts.push(blockAt(src, defs[v])); }
  for (const f of fns) {
    if (!(f in defs)) throw new Error('function not found in Code.gs: ' + f);
    const b = blockAt(src, defs[f]); const code = strip(b);
    if (FORBIDDEN_CALLS.test(code)) throw new Error(f + ' calls an Apps Script service that is not allowed in the read-only runtime.');
    for (const g of APPS_SCRIPT_GLOBALS) if (new RegExp('(?<![.\\w$])' + g + '\\.').test(code) && !provided.has(g)) throw new Error(f + ' uses the Apps Script service ' + g + ' — provide it in src/gas/runtime.ts (read only) first.');
    for (const id of new Set(code.match(/(?<![.\w$])[A-Za-z_$][\w$]*/g) || [])) if (id in defs && !copied.has(id) && !provided.has(id)) (missing[id] = missing[id] || []).push(f);
    parts.push(b);
  }
  for (const v of VARS) for (const id of new Set(strip(blockAt(src, defs[v])).match(/(?<![.\w$])[A-Za-z_$][\w$]*/g) || [])) if (id in defs && !copied.has(id) && !provided.has(id) && id !== v) (missing[id] = missing[id] || []).push(v);
  if (Object.keys(missing).length) {
    console.error('[gen-gas-scope] used but neither copied nor provided:\n' + Object.entries(missing).map(([k, v]) => '  ' + k + '  ← ' + v.join(', ')).join('\n'));
    process.exit(1);
  }
  const md5 = crypto.createHash('md5').update(src).digest('hex');
  const exportsList = fns.concat(VARS.filter((v) => v !== 'APS_REQ_MEMO_'));
  const out = `// @ts-nocheck
/* GENERATED by tools/gen-gas-scope.js from gas-source/Code.gs (md5 ${md5}) — DO NOT EDIT.
 * Code.gs Sheet readers copied word for word; run inside the read-only runtime (src/gas/runtime.ts). */
/* eslint-disable */
export function makeGasScope(rt: any): any {
  const { ${PROVIDED.join(', ')} } = rt;

${parts.join('\n\n')}

  APS_REQ_MEMO_ = {};
  return { ${exportsList.join(', ')} };
}
export const SCOPE_SOURCE_MD5 = '${md5}';
export const SCOPE_FEATURES = ${JSON.stringify(FEATURES)};
`;
  const changed = !fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== out;
  if (process.argv.includes('--check')) { if (changed) { console.error('[gen-gas-scope] src/gas/scope.generated.ts is out of date — run npm run gen-gas'); process.exit(1); } console.log('[gen-gas-scope] up to date'); return; }
  if (changed) fs.writeFileSync(OUT, out);
  console.log('[gen-gas-scope] ' + (changed ? 'written' : 'up to date') + ': ' + fns.length + ' functions, ' + VARS.length + ' vars');
}
main();

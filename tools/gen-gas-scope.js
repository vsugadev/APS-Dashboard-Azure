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
  // Phase 2 step 6 — remaining read-only screens (63 browser calls; classified by tools: no Classroom/Drive/HTTP/Gmail/triggers/writes)
  reads2: [ 'apcIso_', 'acItem_', 'apcKeyOut_', 'apcVal_', 'rosterSheet_', 'acOverridesRaw_', 'scNorm_', 'scCodeOf_', 'scDate_', 'scTime_', 'scSafeUrl_', 'scParseOptions_', 'apsBigStore_', 'apcIsC_', 'apcDecodeObj_', 'srmFmt_', 'amDefaults_', 'amDayStart_', 'amDayEnd_', 'amOvRows_', 'rosterLoadTable_', 'rosterGet_', 'canViewAllDashboardFilters_', 'examQpStudentTeacherAccessEnabled_', 'rosterEnabled_', 'classRolesPrimary_', 'acOverrides_', 'acSwitchable_', 'acCell_', 'acProtected_', 'isNilai4To8Grade_', 'parseConfiguredClockTime_', 'cctStatus_', 'tccDateLabel_', 'tccZoned_', 'tccTzAbbrev_', 'tccTimeText_', 'tccApsIdNumber_', 'tccAnnouncementTitle_', 'getDashboardEnvironment_', 'examQpGenKey_', 'examQpComputeWindow_', 'examQpHmText_', 'examQpDayOf_', 'examQpHm_', 'scSheet_', 'scParseRow_', 'isPermissionDeniedError_', 'apsBigGetStored_', 'apcDecodeRaw_', 'getGoogleReviewEmailFooter', 'saSafeErr_', 'ttmRemovalReached_', 'zhProp_', 'mhgDefaults_', 'mhgEmails_', 'lvIsDate_', 'taMinutes_', 'taExpectedFor_', 'taBand_', 'taHighlights_', 'examLessonNames_', 'taMdY_', 'getOrCreateGradeTimeChangeSheet_', 'gtrRowToObject_', 'lvRoleLabel_', 'teacherDisplayName_', 'adsSchedule_', 'lvFmt_', 'ttmFmtTs_', 'amAccessFlag_', 'amSanitize_', 'amWindow_', 'amOverrides_', 'rosterDataset_', 'gradesForCourses_', 'amCounts_', 'amClassify_', 'amTypeOf_', 'amDueLabel_', 'amStatus_', 'amTsMs_', 'amAdd_', 'adsApsId_', 'amRates_', 'amPct_', 'amEscalate_', 'resolveViewerBadgeName_', 'canViewMonitoringFilters_', 'canViewMonitoringTotals_', 'examinationAccessForRole_', 'rosterAccessForRole_', 'apsRoleFor_', 'acEffectiveForRole_', 'getAllowedTimingsForGrade_', 'scheduleMatchesTimingOption_', 'timingOptionLabel_', 'cctAvailability_', 'cctPublicRecord_', 'parseAPSClassroomName', 'tccMinutes_', 'tkClassChain_', 'tccDateParts_', 'tccSession_', 'tccPublicRecord_', 'apsMailMode_', 'tccEmailHtml_', 'tccIsLive_', 'tccMeetFor_', 'tccDestContext_', 'tccDecorateDest_', 'tccDestRank_', 'tccMarkRecommended_', 'tccRecipients_', 'tccClassMax_', 'tccAnnouncementText_', 'tccSubject_', 'examQpConfig_', 'examQpSpreadsheet_', 'examQpTs_', 'examQpRecordCacheKey_', 'examQpAutoState_', 'examQpWindowOf_', 'examQpScheduleModeOf_', 'examQpExamStatus_', 'examQpLongLabel_', 'examQpTimeLabel_', 'examQpMissingFields_', 'examQpTeacherCopyTeachers_', 'examQpTeacherCopyLeadOk_', 'getOrCreateReferenceLetterSheet_', 'rlRowToObject_', 'srmPublic_', 'adsRows_', 'adsPublic_', 'slDays_', 'scRecords_', 'openSpreadsheetByIdWithRetry_', 'scSpreadsheetId_', 'scEnrSheet_', 'scText_', 'scState_', 'scLabelOf_', 'scRangeLabel_', 'scTimeMinutes_', 'getGoogleReviewUrl', 'apsBigGet_', 'grMonth_', 'taEmailHistory_', 'htmlEscape_', 'taMonthLabelEn_', 'apsEmailShell_', 'taSafeErr_', 'taFirstName_', 'taMonthLabelTa_', 'taSign_', 'taPick_', 'classesPrimaryOnlyPrefix_', 'ttmTcsList_', 'attNameFromEmail_', 'ttmDisplayStatus_', 'tkParticipantsFor_', 'tkSheet_', 'tkCleanEmails_', 'classPrimaryNameFromEmail_', 'zhSheetId_', 'zhJobRunning_', 'zhJsonProp_', 'tkCourseById_', 'zhNorm_', 'zhGradeLabel_', 'zhEmail_', 'mhgSanitize_', 'mhgToday_', 'ccwExcludeRe_', 'mhgSafeLink_', 'mhgCode_', 'mhgDays_', 'mhgMdY_', 'taInt_', 'taToday_', 'taDow_', 'taTeacherLeaveIndex_', 'isAPSSchoolHoliday', 'taScoreOccurrence_', 'taDateMs_', 'gradesCategory_', 'taScoreTeacher_', 'taTs_', 'getTargetSpreadsheetId_', 'taViewer_', 'taReadTable_', 'taRowToTeacher_', 'taWeekBounds_', 'taWeekLabel_', 'acRequireAdmin_', 'readAllGtrRequests_', 'appendEstLabel_', 'getOrCreateAssignmentAuditSheet_', 'lvViewer_', 'lvRows_', 'lvAddDays_', 'lvMaxPastDays_', 'lvMaxSpanDays_', 'lvClasses_', 'lvClassLine_', 'lvPublic_', 'canSendTeacherAppreciation_', 'appreciationTeacherCourses_', 'amViewer_', 'amConfig_', 'amBuild_', 'amSummary_', 'amTeachers_', 'rosterAcademicYear_', 'rosterLabel_', 'gradesLastSync_', 'amHistoryFor_', 'buildAuthenticatedUserPayload_', 'requireSuperAdminViewer_', 'parseClassroomTitle_', 'isTimingChangeWindowOpen_', 'deriveApsId_', 'findTimingChangeCandidates_', 'getAllKnownGrades_', 'normalizeGradeName_', 'hasActiveGtrRequest_', 'isInEmailList_', 'cctViewer_', 'cctWeeks_', 'cctReadRecords_', 'cctAuditCounts_', 'cctRowFor_', 'getOrCreateMeetLinkMapSheet_', 'tccViewer_', 'tccCanUseOriginal_', 'tccSchedule_', 'tccPrimary_', 'tccUpcomingDates_', 'tccHistory_', 'attMailConfigured_', 'tccPublicPlan_', 'tccPlan_', 'getOrCreateUserRoleSheet_', 'examQpViewer_', 'examQpSheet_', 'examQpObjectFromRow_', 'examQpReadRecords_', 'examQpNormDownloadKey_', 'examQpReadEvents_', 'examQpLastSentMap_', 'examQpAutoStatusMap_', 'examQpClientRecord_', 'examQpStaffPaperBlock_', 'examQpTeacherCopyAccess_', 'examQpTeacherCopyBlock_', 'examQpBool_', 'examQpLabel_', 'examQpParseTs_', 'examQpSuspicious_', 'examQpRequireManage_', 'examQpFindRecord_', 'examRequireAccess_', 'getOrCreateExaminationAuditSheet_', 'findGradeChangeCandidates_', 'readAllReferenceLetterRequests_', 'srmViewer_', 'srmAudit_', 'adsAudit_', 'courseNameMatches_', 'srmRows_', 'srmClassTeacher_', 'slAdmin_', 'slPublic_', 'slLists_', 'slProfile_', 'scRequireAdmin_', 'scLoad_', 'scEnrollments_', 'scToday_', 'scSettings_', 'scAudienceAllows_', 'scPublic_', 'scSort_', 'scMyPrograms_', 'scFmtDate_', 'scTo24_', 'scClassroomName_', 'scSheetName_', 'grPromptState_', 'taStoredWeek_', 'taAdminReport_', 'taEmailsOn_', 'taMonthly_', 'taMonthOf_', 'taConfig_', 'taMonthlyEmail_', 'taWeeklyEmail_', 'taRound_', 'ttmViewer_', 'ttmTeachers_', 'ttmPublic_', 'ttmRemovalHour_', 'ttmHourLabel_', 'ttmClassInfo_', 'tkViewer_', 'tkLoad_', 'tkRead_', 'tkReadOnly_', 'tkConfig_', 'tkIsAdmin_', 'tkIsStaffRole_', 'tkDeptName_', 'tkMailMode_', 'tkMailFrom_', 'apsRequireCountryAdmin_', 'zhRequireAdmin_', 'zhSheet_', 'zhBook_', 'zhJobPublic_', 'zhJobGet_', 'tkAccess_', 'tkPublicRow_', 'zhApsStudents_', 'mhgConfig_', 'mhgCollect_', 'mhgEmail_', 'mhgCsv_', 'taClone_', 'taValidateConfig_', 'taCompletedWeek_', 'taEvaluate_', 'personDisplayNameServer_', 'tkStudentScope_', 'tkNameFor_','exportTeacherAppreciation', 'exportUserCountry', 'getAccessControlHistory', 'getAdminAssignmentAuditLog', 'getAdminClassroomAssignments', 'getApplyLeaveData', 'getAppreciationLetterAudit', 'getAssignmentHealthCard', 'getAssignmentMonitoring', 'getAssignmentMonitoringClass', 'getAssignmentMonitoringHistory', 'getAuthenticatedAPSUser', 'getAuthorizedEmailsForGroupSync', 'getCacheSheetUrl', 'getClassChangeContext', 'getClassChangeRequestsForApprover', 'getClassCoverageHistory', 'getClassCoverageTracking', 'getCourseMeetLinkMappings', 'getCourseNameSuffix', 'getCoverageBootstrap', 'getCoveragePlan', 'getDashboardRolePermissions', 'getDashboardUserRoles', 'getExamQuestionPaperAuditLog', 'getExamQuestionPaperMonitoring', 'getExamQuestionPaperPublishPreview', 'getExaminationHistory', 'getGradeChangeApproverInfo', 'getGradeChangeTimingOptions', 'getKnowledgeBaseVideos', 'getLastSyncError', 'getLastSyncInfo', 'getMyClassChangeRequests', 'getMyReferenceLetterRequests', 'getReferenceLetterAccessInfo', 'getReferenceLetterRequestsForApprover', 'getRemovalContext', 'getSchoolLeaveAdminData', 'getSchoolLeaveHistory', 'getShowContactPhone', 'getSpecialClassEnrollments', 'getSpecialClasses', 'getSpecialClassesAdmin', 'getStudentLoginNoticeStatus', 'getTeacherAppreciationAdminReport', 'getTeacherAppreciationEmailPreview', 'getTeacherAppreciationHistory', 'getTempTeacherData', 'getTicket', 'getTicketBootstrap', 'getTicketReports', 'getTicketSettings', 'getUserCountryAdmin', 'getZohoSyncHistory', 'getZohoSyncJob', 'listTickets', 'loadZohoSyncStudents', 'previewMissingGrading', 'previewTeacherAppreciation', 'searchTamilThadamStudents', 'searchTicketStudents'],
  attendance: ['getAttendanceCourseAwkMap', 'defaultDashboardRolePermissions_', 'getEffectiveClassMinutes', 'attAttendedPct_', 'attScoreForPct_', 'attStatusForScore_', 'readDashboardRolePermissionsRaw_', 'attApplyClassDurationRule_', 'getConfigString_', 'readDashboardRolePermissions_', 'attColumnLetter_', 'attRowToRecord_', 'attReadSheetRecords_', 'attWeekIdForDateStr_', 'attShiftDateStr_', 'getDashboardRolePermission_', 'attSummaryKey_', 'attStudentOverallKey_', 'attSummaryOverall_', 'attWeekSheetNameForDate_', 'attReadRecordsForSheets_', 'attEffectiveScore_', 'ensureSheetHeader_', 'getAttendanceWeek1Start_', 'attListWeekSheets_', 'attWeekIdForNumber_', 'classSupportElevated_', 'courseHasStudentEmail_', 'requireDashboardMutationPermission_', 'readAttendanceSummaryMap_', 'getAPSIdFromEmail', 'attReadRecordsForFilters_', 'attOverallFor_', 'attCompareRecords_', 'attCountedMinutes_', 'attWeekNumberForWeekId_', 'formatAwkSheetName_', 'getOrCreateAttendanceAuditLogSheet_', 'attCellToText_', 'getAttendanceRecordsForViewer', 'getOnCallTeacherAttendance', 'getAttendanceWeekOptions', 'getAttendanceAuditLog', 'getAttendanceSyncDiagnostics', 'getAttendanceLastSyncInfo'],
  directory: ['getDirectoryIndex', 'classSupportGrantsAccess_', 'userHasCourseAccess_', 'directoryTierForRole_', 'applyNilaiAndClassTimeFilters_'],
  teacherAvailability: ['getClassTeacherAvailabilityView', 'attOnCallPrefixes_', 'parseClockTime_', 'inferMissingMeridiem_', 'attIsOnCallEmail_', 'getConfigList_', 'isSyntacticallyValidEmail_', 'slAudit_', 'parseCourseSchedule_', 'attIsExcludedEmail_', 'normalizeClassTimeText_', 'ctaProp_', 'attMailAdminCc_', 'attMailCc_', 'apsMailProfile_', 'extractAPSID_', 'apsLeaveSkip_', 'apsClassDateInWeek_', 'examQpParseClassName_', 'readConfiguredUserRoles_', 'ctaExcludeRule_', 'ctaExcluded_', 'isHiddenTeacherName_', 'extractNilaiFromCourseName_', 'extractClassTimeFromCourseName_', 'ctaRoleFlags_', 'ctaConfig_', 'getWeekLabel_', 'ctaNilaiOptions_', 'ctaTimeOptions_', 'isReadOnlyRole_', 'apsMailFrom_', 'ctaReadSelections_', 'findDisplayName_', 'localPartOfEmail_', 'ctaApsId_', 'ctaAyMatch_', 'courseHasTeacherEmail_', 'ctaFmtTs_', 'ctaBuildReport_',],
  // Phase 3 — live data from Apps Script's Script / User Properties (bridge snapshot): the Code.gs passes themselves
  live: ['getRealtimeStatusSnapshot', 'applyRosterHiddenStaffFilter_', 'applyLivePresence_', 'applyLastLogin_', 'applyStudentOnboardedFlag_', 'applyClassStatus_', 'getOnCallTeachers_', 'getRosterHiddenStaffVisible_', 'classesAlwaysShowEmail_', 'getPresenceMap_', 'getLastLoginMap_', 'normalizeLastLoginEntry_', 'summarizeLastLogin_', 'apsBigJson_', 'apsBigSetSafe_', 'getClassStatusOverrideMap_', 'computeAutomaticClassStatus_', 'formatLastLoginTimestamp_', 'classesAlwaysShowEmails_', 'apsBigSet_', 'apcEncodeRaw_', 'apcValIn_', 'apcT_', 'apsClassLiveBoxesForViewer_', 'apsViewerScope_', 'apsRecentActivity_', 'apsScopeById_', 'getLiveMap_', 'getTeacherNotInClassMap_', 'getNeedsTechSupportMap_', 'apsScopeByEmail_', 'apsClassLiveBox_', 'apsAllViewRole_', 'apsCoursesMemoGen_', 'getViewerContext_', 'getRealtimeAvailabilityMap_', 'getExternalActivityRealtimeMap_', 'classAccessFor_', 'classRolesLabel_'],
  country: ['applyUserCountry_', 'getUserCountryMap_', 'ucLegacyMap_', 'ucMap_', 'ucRows_', 'ucSheet_', 'ucPref_', 'apsCountryOn_'],
};
// Module-level vars copied (constants, memo state). Initialisers run per request inside the factory.
const VARS = (process.env.GEN_VARS || '').split(',').filter(Boolean).concat(['CLASS_ROLE_LABEL_', 'COURSES_MEMO_KEY_', 'TEACHER_AVAILABILITY_REALTIME_PROP_KEY', 'EXTERNAL_ACTIVITY_REALTIME_PROP_KEY', 'CLS_LIVE_BOX_CACHE_KEY_', 'COURSES_MEMO_SECONDS_', 'APS_RT_RECENT_KEY_', 'LIVE_PROP_KEY', 'TEACHER_NOT_IN_CLASS_PROP_KEY', 'NEEDS_TECH_SUPPORT_PROP_KEY', 'APS_IDLE_POLL_MS_', 'APC_ISO_RE_', 'CLASSES_ALWAYS_SHOW_CACHE_', 'APS_BIG_MOVED_', 'PRESENCE_PROP_KEY', 'LAST_LOGIN_PROP_KEY', 'LAST_LOGIN_SOURCE_ORDER', 'LAST_LOGIN_SOURCE_LABELS', 'CLASS_STATUS_PROP_KEY', 'CLASS_STATUS_COMPLETION_MINUTES', 'PRESENCE_ONLINE_WINDOW_MINUTES', 'ONBOARDED_STUDENTS_PROP_KEY', 'CLASS_STARTED_MARK_PROP_KEY', 'CLASS_MEET_ENDED_PROP_KEY', 'CLASS_STATUS_LABELS', 'CLASS_STATUS_COLOR_CATEGORY', 'ON_CALL_TEACHERS_PROP_KEY', 'ROSTER_HIDDEN_STAFF_VISIBLE_PROP_KEY', 
  'APS_REQ_MEMO_', 'LAST_LOGIN_TIMEZONE', 'APS_TZ', 'AVAILABILITY_STATUS', 'TEACHER_AVAILABILITY_SHEET_NAME', 'WHATSAPP_LINKS_SHEET_NAME',
  'CLASS_MEET_CACHE_KEY_', 'ATTENDANCE_MEET_LINK_MAP_SHEET_NAME', 'CLASS_MEET_DETECTED_SHEET_',
  'SL_MEMO_', 'SL_CACHE_KEY_', 'SL_SHEET_', 'SL_HEADER_', 'SL_STATUS_',
  'TCC_CACHE_KEY_', 'TCC_SHEET_', 'TCC_HEADER_', 'TTM_CARD_CACHE_', 'TTM_SHEET_', 'TTM_HEADER_',
  'UC_SHEET_', 'UC_HEADER_', 'UC_CACHE_KEY_', 'UC_MEMO_', 'SUPERADMIN_ROLE', 'VCFO_AMCHSTS_BOD_ROLE', 'APC_DOMAIN_', 'APC_LL_SLOTS_', 'AC_CACHE_KEY_', 'AC_SHEET_', 'AC_HEADER_', 'AM_OV_SHEET_', 'AM_OV_HEADER_', 'AC_PROTECTED_', 'NILAI_4_TO_8_GRADE_NAMES', 'TCC_MONTHS_', 'APS_ENV_PROPERTY', 'SC_FIELDS_', 'GRADE_TIME_CHANGE_SHEET_NAME', 'GTR_FIELD_KEYS', 'AM_STAGES_', 'AM_NUM_LIMITS_', 'ROSTER_MEMO_', 'ROSTER_CONFIG', 'ROSTER_CLASSROOM_HEADER', 'ROSTER_TEACHER_HEADER', 'ROSTER_STUDENT_HEADER', 'GRADES_MEMO_', 'GRADES_CONFIG', 'GRADES_WORK_HEADER', 'GRADES_SUB_HEADER', 'CLASS_ROLE_RANK_', 'AC_CATALOG_', 'AVAILABILITY_ALTERNATIVE_LABELS', 'TCC_DAY_NAMES_', 'TCC_MAX_DAYS_AHEAD_', 'TCC_DAY_FULL_', 'CTA_AVAIL_ALT_LABELS_', 'EXAM_QP_AUTO_HEADER_', 'EXAM_QP_EXAM_STATUS', 'REFERENCE_LETTER_SHEET_NAME', 'REFERENCE_LETTER_DATE_TIME_COLUMNS_', 'REFERENCE_LETTER_FIELD_KEYS', 'ADS_SHEET_', 'ADS_HEADER_', 'SC_CACHE_KEY_', 'SC_SPREADSHEET_ID_DEFAULT_', 'SC_ENR_SHEET_', 'SC_STATES_', 'GR_URL_DEFAULT_', 'APC_KEYS_', 'TA_EMAIL_SHEET_', 'TA_EMAIL_HEADER_', 'DS_EN_MONTHS_', 'APS_SCHOOL_LOGO_URL', 'DS_TA_MONTHS_', 'CLASSES_PRIMARY_ONLY_PREFIXES_CACHE_', 'TTM_TCS_SHEET_', 'ZOHO_SYNC_SPREADSHEET_ID_DEFAULT_', 'MHG_TZ_', 'CCW_EXCLUDE_DEFAULT_', 'GRADES_CATEGORY_PREFIXES_', 'APPRECIATION_MIN_WORDS', 'APPRECIATION_MAX_WORDS', 'GTR_STATUS', 'EXAMINATION_HELP_LINKS_', 'TA_TZ_', 'GTR_COLUMNS', 'APS_TIMEZONE_LABEL', 'ASSIGN_CLASSROOM_AUDIT_SHEET_NAME', 'LV_SHEET_', 'LV_HEADER_', 'LV_STATUS_', 'APPRECIATION_MSG_', 'AM_OFF_MSG_', 'AM_MEMO_', 'AM_CONFIG_PROP_', 'ROSTER_STATUS', 'AM_LOG_SHEET_', 'AM_LOG_HEADER_', 'ON_CALL_COORDINATOR_LABEL_', 'GTR_ACTIVE_STATUSES', 'CCT_WEEKS_BACK_', 'CCT_SHEET_', 'CCT_HEADER_', 'TCC_DAY_INDEX_', 'EXAM_QP_MEMO_', 'EXAM_QP_PAPER_HEADER', 'EXAM_QP_DOWNLOAD_HEADER', 'EXAM_QP_SEND_SHEET_', 'EXAM_QP_SEND_HEADER_', 'EXAM_QP_AUTO_REASON_', 'EXAM_QP_AUTO_', 'EXAM_QP_MESSAGES_', 'EXAM_QP_TCOPY_MSG_', 'EXAM_QP_TCOPY_', 'REFERENCE_LETTER_COLUMNS', 'SRM_SHEET_', 'SRM_HEADER_', 'SL_LISTS_DEFAULT_', 'SC_ENR_CACHE_KEY_', 'SC_ENR_HEADER_', 'SC_CACHE_SECONDS_', 'SC_SETTINGS_PROPS_', 'SC_STATE_RANK_', 'SC_MONTHS_', 'SC_SHEET_DEFAULT_', 'GR_MESSAGE_', 'GR_PROMPT_PROP_PREFIX_', 'TA_BAND_', 'TA_RUNS_HEADER_', 'TA_METRICS_', 'TA_METRIC_LABELS_', 'TA_EMAILS_PROP_', 'TA_DEFAULTS_', 'TA_CONFIG_SHEET_', 'TA_CONFIG_HEADER_', 'TA_HIGHLIGHT_TA_', 'TA_OPENINGS_TA_', 'TA_CLOSINGS_TA_', 'TTM_MSG_', 'TTM_OPEN_', 'TK_SHEETS_', 'TK_DEFAULT_RULES_', 'TK_EMAIL_RE_', 'ZH_JOB_PROP_', 'ZH_DAY_NAMES_', 'ZH_SOURCES_', 'MHG_PROP_', 'MHG_CATS_', 'MHG_KIND_LABEL_', 'TA_ITEM_PREFIX_', 'TA_CLASS_STATUS_', 'EXAMINATION_TOPICS', 'EXAMINATION_ASSIGNMENT_NAMES', 'EXAMINATION_CLASSWORK_TYPES', 'EXAMINATION_PRESETS', 'TA_SCORES_SHEET_', 'TA_SCORES_HEADER_', 'TA_BAND_LABEL_', 'TA_HIGHLIGHT_EN_', 'AC_AUDIT_SHEET_', 'AC_AUDIT_HEADER_', 'AC_ROLE_LABELS_', 'APS_CLASS_TIMINGS', 'APPRECIATION_CERTIFICATE_AUDIT_SHEET_NAME', 'AM_MAX_ITEMS_', 'AM_GRADE_STEPS_', 'AM_STATUS_LABEL_', 'TARGET_SPREADSHEET_ID', 'CACHE_SHEET_ID_KEY', 'GTR_MESSAGES', 'GRADE_CHANGE_APPROVER_EMAILS', 'CCT_AUDIT_SHEET_', 'CCT_AUDIT_HEADER_', 'CCT_STATUSES_', 'CCT_ACTION_MAX_', 'EXAM_QP_CONFIG', 'EXAM_QP_AUDIT_HEADER', 'EXAM_QP_DOWNLOAD_STATUS', 'EXAM_QP_STATUS', 'EXAM_QP_STUDENT_STATUS', 'EXAM_QP_APS_DOMAIN_', 'EXAMINATION_CONFIG', 'EXAMINATION_AUDIT_HEADER', 'EXAM_AUDIT_COL', 'FINAL_APPROVER_EMAIL', 'KNOWLEDGE_BASE_VIDEOS', 'LAST_SYNC_ERROR_KEY', 'LAST_SYNC_KEY', 'REFERENCE_LETTER_SOURCE', 'REFERENCE_LETTER_APPROVER_EMAILS', 'REFERENCE_LETTER_FINAL_APPROVER_EMAIL', 'SRM_MIN_WORDS_', 'ADS_MULTI_ACK_', 'SL_TYPES_', 'SL_EMAIL_SHEET_', 'SL_EMAIL_HEADER_', 'SHOW_CONTACT_PHONE', 'SC_UNAVAILABLE_MSG_', 'SC_ENR_STATUSES_', 'SC_PAY_STATUSES_', 'AC_ROLES_', 'AC_OFF_MSG_', 'SC_AUDIENCES_', 'SC_MODES_', 'STUDENT_NOTICE_EXPIRY', 'STUDENT_NOTICE_PROP_PREFIX', 'APS_ALLOWED_DOMAINS', 'TTM_MIN_WORDS_', 'TK_TYPE_ICON_', 'TK_STATUSES_', 'TK_TYPES_', 'TK_PRIORITIES_', 'TK_ACTIVE_STATUSES_', 'TK_CHAIN_TYPES_', 'TK_EVENTS_', 'ZH_LOG_SHEET_', 'ZH_LOG_HEADER_', 'ATTENDANCE_EFFECTIVE_CAP_FROM_MIN', 'ATTENDANCE_EFFECTIVE_CAP_MIN', 'ATTENDANCE_SCORE_TIERS_', 'ATTENDANCE_STATUS', 'ROLE_PERMISSION_CACHE_KEY', 'ROLE_PERMISSION_PROP_KEY', 'ROLE_PERMISSION_CACHE_SECONDS', 'ATTENDANCE_COL_', 'ATTENDANCE_HEADER_ROW', 'ATTENDANCE_SPREADSHEET_ID', 'ATTENDANCE_OVERRIDE_SCORES_', 'ATTENDANCE_WEEK1_START_DEFAULT_', 'ATTENDANCE_WEEK_SHEET_PATTERN_', 'ATTENDANCE_SUMMARY_SHEET_NAME', 'ATTENDANCE_SUMMARY_HEADER_ROW', 'ATTENDANCE_SHEET_PREFIX', 'ATTENDANCE_AUDIT_LOG_SHEET_NAME', 'ATTENDANCE_ROLE', 'ATTENDANCE_SOURCE', 'ATTENDANCE_AUDIT_LOG_HEADER_ROW', 'ATTENDANCE_SYNC_DIAGNOSTIC_KEY', 'ATTENDANCE_LAST_SYNC_SUMMARY_KEY', 'AUTHORIZED_ROLE', 'EXAM_QP_DAY_TOKENS_', 'ATTENDANCE_ON_CALL_PREFIXES_MEMO_', 'ATTENDANCE_ON_CALL_PREFIXES_DEFAULT_', 'SL_AUDIT_SHEET_', 'SL_AUDIT_HEADER_', 'CLASS_SCHEDULE_DAY_TOKENS', 'ATTENDANCE_EXCLUDED_MEMO_', 'ADMIN_EMAILS', 'HEADMASTER_EMAILS', 'ATTENDANCE_ALWAYS_EXCLUDED_EMAILS_', 'VCFO_AMCHATS_BOD_EMAILS', 'ATTENDANCE_MAIL_ADMIN_CC_DEFAULT_', 'APS_MAIL_PROFILES_', 'USER_ROLE_CACHE_KEY', 'USER_ROLE_SHEET_NAME', 'USER_ROLE_CACHE_SECONDS', 'DASHBOARD_ROLES', 'SUPERADMIN_EMAILS', 'CTA_EXCLUDE_ROLES_', 'APS_GRADING_TEAM_EMAILS_', 'HIDDEN_TEACHER_NAMES', 'HIDDEN_TEACHER_NAME_PREFIXES', 'HIDDEN_TEACHER_EMAIL_PREFIXES', 'CTA_DEFAULT_TO_', 'NILAI_FILTER_OPTIONS', 'CLASS_TIME_FILTER_OPTIONS', 'CTA_SELECTION_SHEET_', 'CTA_SELECTION_HEADER_', 'CTA_LABEL_', 'CTA_CODE_TO_LABEL_', 'CTA_DAY_NAMES_', 'COURSE_NAME_SUFFIX',
]);
// Supplied by src/gas/runtime.ts (Apps Script services, workbooks, Azure-side ports).
const PROVIDED = ['apsDashboardUrl_', 'getGoogleProfileName_', 'Sheets', 'SpreadsheetApp', 'CacheService', 'PropertiesService', 'Utilities', 'Session', 'console', 'getWorkbook_', 'getAttendanceWorkbook_',
  'isRosterHiddenStaffEmail_', 'apsTabAllowed_', 'isOnCallCoordinatorEmail_', 'apsRequireTabForToken_', 'requireValidSession_', 'readAllCoursesFromCache_',
  // live Google Meet status (Meet / Reports APIs + script lock) — not on Azure yet; Code.gs's catch uses the schedule
  'classMeetLiveSnapshot_', 'classMeetApplyLive_',
  // chat is not on Azure yet: a constant chat version, so the page never reloads a chat it cannot load here
  'chatVersion_'];
// Writers that may be reached but are wrapped in try/catch in Code.gs (best-effort audit) — allowed: the runtime refuses the write.
// (slAudit_ appends to APS_SCHOOL_LEAVE_AUDIT_LOG; Azure does not write it.)
// Apps Script globals: any the copied code uses must be provided by the runtime (checked — nothing can be undefined).
const APPS_SCRIPT_GLOBALS = ['Sheets', 'SpreadsheetApp', 'CacheService', 'PropertiesService', 'Utilities', 'Session', 'Logger', 'HtmlService', 'ContentService', 'Drive', 'People', 'Gmail', 'Calendar', 'XmlService', 'Charts', 'Maps', 'Classroom', 'ScriptApp', 'UrlFetchApp', 'DriveApp', 'GmailApp', 'MailApp', 'LockService', 'AdminDirectory', 'AdminReports'];
const FORBIDDEN_CALLS = /ScriptApp|Classroom\.|UrlFetchApp|GmailApp|MailApp|DriveApp|LockService|AdminDirectory|AdminReports/; // property writes are allowed: the runtime keeps them in the request only (Phase 3)

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
/** A top-level var plus the top-level statements that fill it in, e.g. `var APC_KEYS_ = {}; APC_KEYS_[LAST_LOGIN_PROP_KEY] = 'll';`
 *  (same line) or `NAME.x = …;` / `NAME[k] = …;` starting a later line — without them the copy would be an empty object. */
function varWithSetup(src, name, at) {
  const decl = blockAt(src, at); let out = decl;
  const esc = name.replace(/[$]/g, '\\$');
  let j = at + decl.length;
  const same = new RegExp('^[ \\t]*' + esc + '[\\[.]');
  while (same.test(src.slice(j, src.indexOf('\n', j)))) { const k = src.slice(j).search(new RegExp(esc + '[\\[.]')) + j; const b = blockAt(src, k); out += ' ' + b; j = k + b.length; }
  const later = new RegExp('^' + esc + '[\\[.][^\\n=]*=(?!=)', 'gm'); let m;
  while ((m = later.exec(src))) if (m.index > at) out += '\n' + blockAt(src, m.index);
  return out;
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");

function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  const defs = {}; let m;
  const reF = /^function ([A-Za-z_$][\w$]*)\s*\(/gm; while ((m = reF.exec(src))) defs[m[1]] = m.index;
  const reV = /^(?:var|const|let) ([A-Za-z_$][\w$]*)\s*=/gm; while ((m = reV.exec(src))) if (!(m[1] in defs)) defs[m[1]] = m.index; // every top-level name
  const fns = Array.from(new Set(Object.values(FEATURES).flat()));
  const copied = new Set(fns.concat(VARS)), provided = new Set(PROVIDED), parts = [], missing = {};
  // Module-level names in Code.gs SOURCE ORDER (as Apps Script initialises them; top-level const/let must not be read early).
  for (const v of VARS.slice().sort((a, b) => (defs[a] ?? 0) - (defs[b] ?? 0))) { if (!(v in defs)) throw new Error('var not found in Code.gs: ' + v); parts.push(varWithSetup(src, v, defs[v])); }
  for (const f of fns) {
    if (!(f in defs)) throw new Error('function not found in Code.gs: ' + f);
    const b = blockAt(src, defs[f]); const code = strip(b);
    if (FORBIDDEN_CALLS.test(code)) throw new Error(f + ' calls an Apps Script service that is not allowed in the read-only runtime.');
    for (const g of APPS_SCRIPT_GLOBALS) if (new RegExp('(?<![.\\w$])' + g + '\\.').test(code) && !provided.has(g)) throw new Error(f + ' uses the Apps Script service ' + g + ' — provide it in src/gas/runtime.ts (read only) first.');
    for (const id of new Set(code.match(/(?<![.\w$])[A-Za-z_$][\w$]*/g) || [])) if (id in defs && !copied.has(id) && !provided.has(id)) (missing[id] = missing[id] || []).push(f);
    parts.push(b);
  }
  for (const v of VARS) for (const id of new Set(strip(varWithSetup(src, v, defs[v])).match(/(?<![.\w$])[A-Za-z_$][\w$]*/g) || [])) if (id in defs && !copied.has(id) && !provided.has(id) && id !== v) (missing[id] = missing[id] || []).push(v);
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

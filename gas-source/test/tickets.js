// r52: 🎫 Tickets — assignment rules, RBAC, admin override, email (sender, admin CC, de-dup, failure), audit (node test/tickets.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const D = 'avvaiyarpadasalai.org';
const PT = 'teacherb_aps102@' + D, VP = 'vp.maz_aps9005@' + D, HM = 'hm.maz_aps9012@' + D, MEENA = 'meena_aps5555@' + D;
function setup(o) {
  o = o || {};
  const F = build(); const { env, cls, ids } = F;
  { const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0); P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p; }
  const NAMES = { [VP]: 'Vasanthi Prabhu', [HM]: 'Hari Mohan' };
  env.ctx.Classroom.Courses.Teachers.create = (res, cid) => { const prof = { id: 'N' + res.userId, name: { fullName: NAMES[res.userId] || 'Named' }, emailAddress: res.userId }; cls.teachers[cid].push({ userId: 'N' + res.userId, profile: prof }); return { profile: prof }; };
  const maz = cls.courses.find(c => c.id === ids.MAZ);
  maz.description = PT; maz.room = 'Zoom 4 | VP Email: ' + VP + ' | HM Email: ' + HM;
  F.G.syncClassroomData();
  // mail transport mocks
  const mail = { gmail: [], mailapp: [], fail: !!o.mailFail, tokenCalls: 0 };
  env.ctx.Utilities.computeRsaSha256Signature = () => [1, 2, 3];
  env.ctx.Utilities.base64EncodeWebSafe = b => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64url');
  env.ctx.Utilities.base64Encode = b => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64');
  env.ctx.Utilities.base64Decode = s => Array.from(Buffer.from(String(s), 'base64'));
  env.ctx.Utilities.newBlob = (data, mime, name) => { const bytes = typeof data === 'string' ? Array.from(Buffer.from(data, 'utf8')) : data; return { getBytes: () => bytes, getName: () => name, getContentType: () => mime }; };
  env.ctx.UrlFetchApp.fetch = (url, opt) => {
    if (/oauth2\.googleapis\.com\/token/.test(url)) { mail.tokenCalls++; return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'AT-SECRET', expires_in: 3600 }) }; }
    if (/gmail\/v1\/users\/me\/messages\/send/.test(url)) {
      if (mail.fail) return { getResponseCode: () => 500, getContentText: () => 'boom' };
      const raw = Buffer.from(JSON.parse(opt.payload).raw, 'base64url').toString('utf8');
      const hdr = n => ((raw.match(new RegExp('^' + n + ': (.*)$', 'm')) || [])[1] || '');
      const dec = s => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (m, b) => Buffer.from(b, 'base64').toString('utf8'));
      mail.gmail.push({ from: hdr('From'), to: hdr('To').split(', ').filter(Boolean), cc: hdr('Cc').split(', ').filter(Boolean), subject: dec(hdr('Subject')), raw, auth: opt.headers.Authorization });
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    }
    return { getResponseCode: () => 404, getContentText: () => '' };
  };
  env.ctx.MailApp.sendEmail = p => mail.mailapp.push(p);
  const drive = {}; let seq = 0;
  env.ctx.DriveApp = { createFolder: n => ({ getId: () => 'FOLD', createFile: blob => { const id = 'FILE' + (++seq); drive[id] = blob; return { getId: () => id }; } }),
    getFolderById: id => ({ getId: () => id, createFile: blob => { const fid = 'FILE' + (++seq); drive[fid] = blob; return { getId: () => fid }; } }),
    getFileById: id => ({ getBlob: () => drive[id] }) };
  if (!o.noMail) env.props.TICKET_MAIL_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'aps-mailer@aps-proj.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----SECRETKEY' });
  const T = { admin: F.tok('admin@aps.org', 'admin'), meena: F.tok(MEENA, 'student'), joshua: F.tok('joshua_aps3407@' + D, 'student'), tb: F.tok(PT, 'teacher'),
    ta: F.tok('teachera_aps101@' + D, 'teacher'), vp: F.tok(VP, 'teacher'), hm: F.tok('hm@aps.org', 'headmaster'), five: F.tok('five_aps5005@' + D, 'student'), bod: F.tok('bod@aps.org', 'vcfo_amchsts_bod') };
  return Object.assign(F, { mail, T, drive });
}
const sheet = (F, n) => { const sh = F.env.wb.getSheetByName(n); return sh.data.slice(1).filter(r => r && r[0]); };
const H = (F, n) => F.env.wb.getSheetByName(n).data[0];
const col = (F, n, row, c) => row[H(F, n).indexOf(c)];
const assignees = (F, id) => sheet(F, 'APS_TICKET_PARTICIPANTS').filter(r => col(F, 'APS_TICKET_PARTICIPANTS', r, 'Ticket_ID') === id && col(F, 'APS_TICKET_PARTICIPANTS', r, 'Active') === 'TRUE' && col(F, 'APS_TICKET_PARTICIPANTS', r, 'Participant_Type') === 'ASSIGNEE').map(r => col(F, 'APS_TICKET_PARTICIPANTS', r, 'Email')).sort();
const audit = (F, id) => sheet(F, 'APS_TICKET_AUDIT_LOG').filter(r => col(F, 'APS_TICKET_AUDIT_LOG', r, 'Ticket_ID') === id).map(r => col(F, 'APS_TICKET_AUDIT_LOG', r, 'Action'));
let rq = 0; const mk = (F, tok, type, extra) => J(F.G.createTicket(tok, Object.assign({ type, subject: type + ' request ' + (++rq), description: 'Please help with ' + type, requestId: 'r' + rq }, extra || {})));

const CHAIN = [PT, HM, VP].sort();
const RULES = {
  'BOOKS': ['simplysuga_aps501@' + D], 'TECH SUPPORT': ['info1@' + D, 'info@' + D], 'ATTENDANCE': CHAIN, 'LEAVE': CHAIN,
  'EXAMINATION': CHAIN.concat('examinations_aps9021@' + D).sort(), 'CLASS ROOM': CHAIN.concat('info@' + D, 'info1@' + D).sort(),
  'KAHOOT': CHAIN.concat('games_aps9020@' + D).sort(), 'EVENTS': CHAIN.concat('events_aps9018@' + D, 'competitions_aps9019@' + D).sort()
};

t('student lookup: resolves Student → APSID → Classroom → Primary Teacher → HM → VP from the existing class data', () => {
  const F = setup();
  const s = J(F.G.searchTicketStudents(F.T.admin, 'meena'));
  assert.strictEqual(s.results[0].email, MEENA); assert.strictEqual(s.results[0].apsId, 'APS5555');
  assert.strictEqual(J(F.G.searchTicketStudents(F.T.admin, '5555')).results[0].email, MEENA, 'APSID digits');
  assert.strictEqual(J(F.G.searchTicketStudents(F.T.admin, MEENA)).results[0].email, MEENA, 'email');
  const r = J(F.G.resolveTicketStudent(F.T.admin, MEENA, ''));
  assert.ok(/MAZHALAI - CB/.test(r.classroom)); assert.deepStrictEqual([r.primaryTeacher[0].email, r.headmaster[0].email, r.vp[0].email], [PT, HM, VP]);
  assert.strictEqual(r.headmaster[0].name, 'Hari Mohan'); assert.deepStrictEqual(r.missing, []);
  const me = J(F.G.searchTicketStudents(F.T.joshua, 'meena'));
  assert.deepStrictEqual(me.results.map(x => x.email), ['joshua_aps3407@' + D], 'a student only ever sees themselves');
  assert.throws(() => F.G.resolveTicketStudent(F.T.joshua, MEENA, ''), /only raise tickets for themselves/);
  assert.throws(() => F.G.resolveTicketStudent(F.T.ta, MEENA, ''), /not found in the classes you can access/, 'teacher limited to own classes');
});

Object.keys(RULES).forEach(type => t('rule ' + type + ': exact automatic assignees', () => {
  const F = setup();
  const r = mk(F, F.T.admin, type, { studentEmail: MEENA });
  assert.ok(/^APS-\d{8}-\d{4}$/.test(r.ticketNumber), r.ticketNumber);
  assert.deepStrictEqual(assignees(F, r.ticketId), RULES[type]);
  assert.strictEqual(r.status, 'ASSIGNED');
}));

t('rule OTHERS: no automatic assignee, flagged, Admin assigns manually', () => {
  const F = setup();
  const r = mk(F, F.T.tb, 'OTHERS');
  assert.deepStrictEqual(assignees(F, r.ticketId), []); assert.strictEqual(r.status, 'NEW'); assert.ok(/Manual assignment/.test(r.flags.join()));
  const a = J(F.G.assignTicket(F.T.admin, { ticketId: r.ticketId, assignees: ['support@' + D] }));
  assert.strictEqual(a.action, 'ASSIGN'); assert.strictEqual(a.status, 'ASSIGNED');
  assert.deepStrictEqual(assignees(F, r.ticketId), ['support@' + D]);
});

t('chain types need a student; missing Teacher/HM/VP is flagged (ticket kept, Admin can intervene)', () => {
  const F = setup();
  assert.throws(() => mk(F, F.T.admin, 'LEAVE'), /select the student/);
  const r = mk(F, F.T.five, 'LEAVE'); // student raising for self; class has no Primary/HM/VP labels
  assert.ok(r.ok && r.status === 'NEW');
  assert.ok(/Primary Teacher not found/.test(r.flags.join()) && /Headmaster not found/.test(r.flags.join()) && /VP not found/.test(r.flags.join()));
  assert.ok(audit(F, r.ticketId).includes('ASSIGNMENT_FLAG'));
});

t('ticket numbers unique & sequential per day; duplicate submission (same requestId or same content within 2 min) returns the first ticket', () => {
  const F = setup();
  const a = mk(F, F.T.meena, 'BOOKS'), b = mk(F, F.T.meena, 'BOOKS');
  assert.notStrictEqual(a.ticketNumber, b.ticketNumber); assert.strictEqual(Number(b.ticketNumber.slice(-4)), Number(a.ticketNumber.slice(-4)) + 1);
  const again = J(F.G.createTicket(F.T.meena, { type: 'BOOKS', subject: 'x subject', description: 'need a book', requestId: 'SAME' }));
  const dup = J(F.G.createTicket(F.T.meena, { type: 'BOOKS', subject: 'x subject', description: 'need a book', requestId: 'SAME' }));
  assert.ok(dup.duplicate && dup.ticketNumber === again.ticketNumber);
  const dup2 = J(F.G.createTicket(F.T.meena, { type: 'BOOKS', subject: 'x subject', description: 'need a book', requestId: 'OTHER' }));
  assert.ok(dup2.duplicate && dup2.ticketNumber === again.ticketNumber, 'content duplicate');
  assert.strictEqual(sheet(F, 'APS_TICKETS').length, 3);
});

t('email: From donotreply@ via Gmail API; admin@ always CC; de-duplicated; never in both To and CC; subject format', () => {
  const F = setup();
  const r = mk(F, F.T.meena, 'CLASS ROOM'); // requester + PT/HM/VP + info@ + info1@
  const m = F.mail.gmail[0];
  assert.strictEqual(m.from, 'APS Dashboard Tickets <donotreply@' + D + '>');
  assert.deepStrictEqual(m.cc, ['admin@' + D]);
  assert.deepStrictEqual(m.to.slice().sort(), [MEENA].concat(RULES['CLASS ROOM']).sort());
  assert.strictEqual(new Set(m.to).size, m.to.length, 'no duplicates');
  assert.ok(!m.to.includes('admin@' + D));
  assert.strictEqual(m.subject, '[APS Ticket #' + r.ticketNumber + '] Class Room - Meena'); // r54: readable title case
  const html = Buffer.from(m.raw.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n')[0], 'base64').toString('utf8');
  ['Avvaiyar Padasalai', 'Classroom Dashboard', 'A new ticket has been created', r.ticketNumber, 'Class Room', 'Normal priority', 'Assigned', 'Meena', 'APS5555', 'MAZHALAI - CB', 'Primary Teacher', '?ticket=' + r.ticketNumber, 'Assigned To',
    'OPEN TICKET IN APS DASHBOARD', 'Please do not reply to this email', 'Warm regards', 'auto-generated email'].forEach(x => assert.ok(html.includes(x), x)); // r54: standard APS email shell
  assert.ok(!/width:150px|width:\d{3,}px;(?!.*max-width)/.test(html.replace(/max-width:680px/g, '')), 'no fixed wide columns (phone friendly)');
  const text = Buffer.from(m.raw.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n')[0], 'base64').toString('utf8');
  ['Ticket Number: ' + r.ticketNumber, 'Ticket Type: ', 'Student: Meena', 'Description:', 'Open the ticket in the APS Dashboard: ', 'Warm regards'].forEach(x => assert.ok(text.includes(x), 'text: ' + x));
  // admin creating a ticket where admin@ would also be a recipient: still exactly once (CC)
  F.G.assignTicket(F.T.admin, { ticketId: r.ticketId, assignees: ['admin@' + D, 'ADMIN@' + D, 'info@' + D], reason: 'test dedupe' });
  const last = F.mail.gmail[F.mail.gmail.length - 1];
  assert.ok(!last.to.includes('admin@' + D) && last.cc.join() === 'admin@' + D);
  assert.ok(audit(F, r.ticketId).includes('EMAIL_SENT'));
  assert.ok(!JSON.stringify(sheet(F, 'APS_TICKET_AUDIT_LOG')).includes('SECRETKEY') && !JSON.stringify(sheet(F, 'APS_TICKET_AUDIT_LOG')).includes('AT-SECRET'), 'no credentials in audit');
});

t('email failure never loses the ticket: EMAIL_FAILED audited, friendly message; not configured = failed safely', () => {
  const F = setup({ mailFail: true });
  const r = mk(F, F.T.meena, 'BOOKS');
  assert.ok(r.ok && r.email.ok === false && /ticket is saved/.test(r.email.error));
  assert.ok(audit(F, r.ticketId).includes('EMAIL_FAILED'));
  const G2 = setup({ noMail: true });
  const r2 = mk(G2, G2.T.meena, 'BOOKS');
  assert.ok(r2.ok && r2.email.ok === false); assert.strictEqual(G2.mail.mailapp.length, 0, 'no silent fallback sender');
  G2.env.props.TICKET_MAIL_ALLOW_MAILAPP_FALLBACK = 'true';
  mk(G2, G2.T.meena, 'TECH SUPPORT');
  assert.strictEqual(G2.mail.mailapp.length, 1); assert.strictEqual(G2.mail.mailapp[0].replyTo, 'donotreply@' + D); assert.strictEqual(G2.mail.mailapp[0].cc, 'admin@' + D);
});

t('admin override: previous/new assignees, admin, time, reason in the audit; responsible people not silently replaced by adding a participant', () => {
  const F = setup();
  const r = mk(F, F.T.admin, 'ATTENDANCE', { studentEmail: MEENA });
  F.G.addTicketParticipant(F.T.admin, { ticketId: r.ticketId, email: 'office_aps1@' + D });
  assert.deepStrictEqual(assignees(F, r.ticketId), CHAIN, 'adding a participant keeps Teacher/HM/VP');
  const o = J(F.G.assignTicket(F.T.admin, { ticketId: r.ticketId, assignees: [PT, 'ta2_aps777@' + D], reason: 'HM on leave' }));
  assert.strictEqual(o.action, 'ADMIN_OVERRIDE');
  const row = sheet(F, 'APS_TICKET_AUDIT_LOG').find(x => col(F, 'APS_TICKET_AUDIT_LOG', x, 'Action') === 'ADMIN_OVERRIDE');
  assert.strictEqual(col(F, 'APS_TICKET_AUDIT_LOG', row, 'Old_Value'), CHAIN.slice().sort((a, b) => [PT, HM, VP].indexOf(a) - [PT, HM, VP].indexOf(b)).join('; '));
  assert.strictEqual(col(F, 'APS_TICKET_AUDIT_LOG', row, 'New_Value'), PT + '; ta2_aps777@' + D);
  assert.strictEqual(col(F, 'APS_TICKET_AUDIT_LOG', row, 'Performed_By_Email'), 'admin@aps.org');
  assert.strictEqual(col(F, 'APS_TICKET_AUDIT_LOG', row, 'Notes'), 'HM on leave'); assert.ok(col(F, 'APS_TICKET_AUDIT_LOG', row, 'Date_Time'));
  const ov = F.mail.gmail[F.mail.gmail.length - 1];
  assert.ok(ov.to.includes('ta2_aps777@' + D) && ov.to.includes(HM) && ov.to.includes(VP) && ov.to.includes('admin@aps.org'), 'new + removed + requester notified');
  // reassign a non-rule ticket -> REASSIGN
  const b = mk(F, F.T.admin, 'OTHERS'); F.G.assignTicket(F.T.admin, { ticketId: b.ticketId, assignees: ['x_aps1@' + D] });
  assert.strictEqual(J(F.G.assignTicket(F.T.admin, { ticketId: b.ticketId, assignees: ['y_aps2@' + D] })).action, 'REASSIGN');
  assert.throws(() => F.G.assignTicket(F.T.admin, { ticketId: b.ticketId, assignees: ['not-an-email'] }), /valid assignee|Invalid email/);
});

t('security: only Admin sees All Tickets / reports / settings / assignment / participants; server-side checks', () => {
  const F = setup();
  const r = mk(F, F.T.meena, 'BOOKS');
  for (const k of ['tb', 'meena', 'hm', 'vp']) {
    assert.throws(() => F.G.listTickets(F.T[k], { scope: 'all' }), /Only Admin/);
    assert.throws(() => F.G.getTicketReports(F.T[k], {}), /Only Admin/);
    assert.throws(() => F.G.getTicketSettings(F.T[k]), /Only Admin/);
    assert.throws(() => F.G.saveTicketSettings(F.T[k], { adminCc: 'x@y.org' }), /Only Admin/);
    assert.throws(() => F.G.assignTicket(F.T[k], { ticketId: r.ticketId, assignees: [PT] }), /Only Admin/);
    assert.throws(() => F.G.addTicketParticipant(F.T[k], { ticketId: r.ticketId, email: PT }), /Only Admin/);
  }
  assert.throws(() => F.G.getTicket(F.T.joshua, r.ticketId), /do not have access/, 'other student');
  assert.throws(() => F.G.getTicket(F.T.ta, r.ticketId), /do not have access/, 'unrelated teacher');
  assert.throws(() => F.G.getTicket('forged-token', r.ticketId), /SESSION_EXPIRED/);
  assert.throws(() => F.G.createTicket(F.T.bod, { type: 'BOOKS', subject: 'abc', description: 'abcdef' }), /read-only/);
  assert.throws(() => F.G.updateTicket(F.T.meena, { ticketId: r.ticketId, status: 'CLOSED' }), /not allowed/);
  assert.throws(() => F.G.updateTicket(F.T.meena, { ticketId: r.ticketId, priority: 'URGENT' }), /Only Admin/);
});

t('internal notes: staff only — never returned to the student requester; student cannot post them', () => {
  const F = setup();
  const r = mk(F, F.T.meena, 'LEAVE');
  F.G.replyTicket(F.T.tb, { ticketId: r.ticketId, message: 'Parent called — sensitive', internal: true });
  F.G.replyTicket(F.T.tb, { ticketId: r.ticketId, message: 'Leave approved for Friday.' });
  const st = J(F.G.getTicket(F.T.meena, r.ticketId));
  assert.ok(!JSON.stringify(st).includes('sensitive')); assert.strictEqual(st.can.internal, false);
  assert.ok(st.messages.some(m => m.kind === 'STAFF' && /approved/.test(m.message)) && st.messages[0].kind === 'REQUESTER');
  assert.throws(() => F.G.replyTicket(F.T.meena, { ticketId: r.ticketId, message: 'x', internal: true }), /Only staff/);
  const tv = J(F.G.getTicket(F.T.tb, r.ticketId)); assert.ok(tv.messages.some(m => m.kind === 'INTERNAL' && /sensitive/.test(m.message)));
  const vp = J(F.G.getTicket(F.T.vp, r.ticketId)); assert.ok(vp.can.internal, 'VP of the class is staff on it');
  assert.ok(!audit(F, r.ticketId).includes('sensitive'));
  const note = F.mail.gmail.find(m => /Internal Note/.test(m.subject)); assert.ok(note && !note.to.includes(MEENA), 'internal note never emailed to the student');
  assert.strictEqual(J(F.G.getTicket(F.T.meena, r.ticketId)).audit, undefined, 'audit history admin only');
});

t('workflow: staff reply -> IN PROGRESS; waiting -> requester reply -> IN PROGRESS; resolve/close; admin reopen; closed blocks replies', () => {
  const F = setup();
  const r = mk(F, F.T.meena, 'ATTENDANCE');
  assert.strictEqual(J(F.G.replyTicket(F.T.tb, { ticketId: r.ticketId, message: 'Looking into it' })).status, 'IN PROGRESS');
  F.G.updateTicket(F.T.tb, { ticketId: r.ticketId, status: 'WAITING FOR USER' });
  assert.strictEqual(J(F.G.replyTicket(F.T.meena, { ticketId: r.ticketId, message: 'Here is the info' })).status, 'IN PROGRESS');
  F.G.updateTicket(F.T.tb, { ticketId: r.ticketId, status: 'RESOLVED' });
  assert.ok(F.mail.gmail.some(m => /^\[APS Ticket #APS-\d{8}-\d{4}\] Ticket Resolved - /.test(m.subject) && m.subject.indexOf(r.ticketNumber) > 0 && m.to.includes(MEENA)));
  assert.throws(() => F.G.updateTicket(F.T.tb, { ticketId: r.ticketId, status: 'CLOSED' }), /not allowed/, 'teacher cannot close');
  F.G.updateTicket(F.T.admin, { ticketId: r.ticketId, status: 'CLOSED', reason: 'done' });
  assert.throws(() => F.G.replyTicket(F.T.meena, { ticketId: r.ticketId, message: 'one more' }), /closed/);
  assert.throws(() => F.G.updateTicket(F.T.tb, { ticketId: r.ticketId, status: 'REOPEN' }), /Only Admin/);
  const re = J(F.G.updateTicket(F.T.admin, { ticketId: r.ticketId, status: 'REOPEN', reason: 'parent asked again' }));
  assert.strictEqual(re.status, 'IN PROGRESS');
  const d = J(F.G.getTicket(F.T.admin, r.ticketId));
  assert.ok(!d.ticket.closedAt); assert.ok(d.audit.some(a => a.action === 'REOPEN' && a.oldValue === 'CLOSED' && a.notes === 'parent asked again'));
  ['CREATE', 'ASSIGN', 'PUBLIC_REPLY', 'CHANGE_STATUS', 'RESOLVE', 'CLOSE', 'REOPEN', 'EMAIL_SENT'].forEach(a => assert.ok(d.audit.some(x => x.action === a), a));
  F.G.updateTicket(F.T.admin, { ticketId: r.ticketId, priority: 'URGENT', type: 'LEAVE', applyRules: true, reason: 'retype' });
  const d2 = J(F.G.getTicket(F.T.admin, r.ticketId)); assert.strictEqual(d2.ticket.priority, 'URGENT'); assert.strictEqual(d2.ticket.type, 'LEAVE');
  assert.ok(d2.audit.some(x => x.action === 'CHANGE_TYPE') && d2.audit.some(x => x.action === 'CHANGE_PRIORITY'));
});

t('visibility: requester / assignee / VP & teacher of the class / school HM; "My Tickets" vs "Assigned to Me"', () => {
  const F = setup();
  const r = mk(F, F.T.meena, 'KAHOOT');
  assert.deepStrictEqual(J(F.G.listTickets(F.T.meena, { scope: 'mine' })).rows.map(x => x.number), [r.ticketNumber]);
  assert.deepStrictEqual(J(F.G.listTickets(F.T.vp, { scope: 'assigned' })).rows.map(x => x.number), [r.ticketNumber]);
  assert.strictEqual(J(F.G.listTickets(F.T.ta, { scope: 'assigned', includeClasses: true })).total, 0);
  assert.ok(J(F.G.getTicket(F.T.hm, r.ticketId)).ticket, 'school Head Master sees class tickets');
  assert.strictEqual(J(F.G.listTickets(F.T.joshua, { scope: 'mine' })).total, 0);
});

t('All Tickets: search (number, student, APSID, email, requester, subject, description, assignee), filters, paging (large volume)', () => {
  const F = setup();
  for (let i = 0; i < 60; i++) F.G.createTicket(F.T.admin, { type: i % 2 ? 'BOOKS' : 'TECH SUPPORT', subject: 'Bulk ' + i, description: 'bulk description ' + i, requestId: 'b' + i, priority: i % 5 ? 'NORMAL' : 'HIGH' });
  const r = mk(F, F.T.meena, 'EVENTS', { description: 'Annual day costume question' });
  const all = J(F.G.listTickets(F.T.admin, { scope: 'all', pageSize: 25 }));
  assert.strictEqual(all.total, 61); assert.strictEqual(all.rows.length, 25); assert.strictEqual(all.pages, 3);
  assert.strictEqual(J(F.G.listTickets(F.T.admin, { scope: 'all', page: 3, pageSize: 25 })).rows.length, 11);
  const q = s => J(F.G.listTickets(F.T.admin, { scope: 'all', q: s })).rows.map(x => x.number);
  [r.ticketNumber, 'meena', 'APS5555', MEENA, 'costume', 'events_aps9018', 'Hari Mohan'].forEach(s => assert.deepStrictEqual(q(s), [r.ticketNumber], s));
  assert.strictEqual(J(F.G.listTickets(F.T.admin, { scope: 'all', filters: { type: 'BOOKS' } })).total, 30);
  assert.strictEqual(J(F.G.listTickets(F.T.admin, { scope: 'all', filters: { priority: 'HIGH' } })).total, 12);
  assert.strictEqual(J(F.G.listTickets(F.T.admin, { scope: 'all', filters: { assignee: 'simplysuga_aps501@' + D } })).total, 30);
  assert.strictEqual(J(F.G.listTickets(F.T.admin, { scope: 'all', filters: { student: '5555' } })).total, 1);
  assert.strictEqual(J(F.G.listTickets(F.T.admin, { scope: 'all', filters: { createdBy: MEENA } })).total, 1);
  assert.strictEqual(J(F.G.listTickets(F.T.admin, { scope: 'all', filters: { status: 'OPEN' } })).total, 61);
  const today = new Date().toISOString().slice(0, 10);
  assert.strictEqual(J(F.G.listTickets(F.T.admin, { scope: 'all', filters: { from: '2000-01-01', to: '2000-01-02' } })).total, 0);
  assert.ok(J(F.G.listTickets(F.T.admin, { scope: 'all' })).facets.assignees.length >= 3);
  const rep = J(F.G.getTicketReports(F.T.admin, {}));
  assert.strictEqual(rep.total, 61); assert.strictEqual(rep.byType.BOOKS, 30); assert.strictEqual(rep.highUrgent, 12); assert.strictEqual(rep.open, 61);
  assert.ok(rep.byAssignee[Object.keys(rep.byAssignee).find(k => /simplysuga/.test(k))] === 30);
});

t('settings: Admin edits rules / CC / notifications with validation; chain types keep Teacher/HM/VP; audited', () => {
  const F = setup();
  const s = J(F.G.getTicketSettings(F.T.admin));
  assert.strictEqual(s.email.from, 'donotreply@' + D); assert.strictEqual(s.email.mode, 'SERVICE_ACCOUNT'); assert.ok(!JSON.stringify(s).includes('SECRETKEY'));
  assert.deepStrictEqual(s.types.map(x => x.type), ['BOOKS', 'CLASS ROOM', 'LEAVE', 'TECH SUPPORT', 'EXAMINATION', 'ATTENDANCE', 'EVENTS', 'KAHOOT', 'OTHERS']);
  assert.throws(() => F.G.saveTicketSettings(F.T.admin, { rules: { BOOKS: { emails: ['bad'] } } }), /invalid email/);
  const rules = {}; s.types.forEach(x => { rules[x.type] = { chain: false, emails: x.emails }; });
  rules.BOOKS.emails = ['library_aps1@' + D];
  F.G.saveTicketSettings(F.T.admin, { rules, notify: { REPLY: false } });
  const s2 = J(F.G.getTicketSettings(F.T.admin));
  assert.deepStrictEqual(s2.types.find(x => x.type === 'BOOKS').emails, ['library_aps1@' + D]);
  assert.strictEqual(s2.types.find(x => x.type === 'ATTENDANCE').chain, true, 'chain cannot be switched off');
  assert.strictEqual(s2.notify.REPLY, false);
  const r = mk(F, F.T.meena, 'BOOKS'); assert.deepStrictEqual(assignees(F, r.ticketId), ['library_aps1@' + D]);
  const n = F.mail.gmail.length; F.G.replyTicket(F.T.meena, { ticketId: r.ticketId, message: 'thanks' }); assert.strictEqual(F.mail.gmail.length, n, 'REPLY emails disabled');
  assert.ok(sheet(F, 'APS_TICKET_AUDIT_LOG').some(x => col(F, 'APS_TICKET_AUDIT_LOG', x, 'Action') === 'CONFIG_CHANGE'));
});

t('attachments: type/size checked; download only for people who can see the message', () => {
  const F = setup();
  const b64 = Buffer.from('hello pdf').toString('base64');
  assert.throws(() => mk(F, F.T.meena, 'BOOKS', { attachments: [{ name: 'x.exe', mimeType: 'application/x-msdownload', base64: b64 }] }), /not an allowed file type/);
  const r = mk(F, F.T.meena, 'BOOKS', { attachments: [{ name: 'list.pdf', mimeType: 'application/pdf', base64: b64 }] });
  const d = J(F.G.getTicket(F.T.meena, r.ticketId)); const a = d.messages[0].attachments[0];
  assert.strictEqual(a.name, 'list.pdf');
  assert.strictEqual(Buffer.from(J(F.G.getTicketAttachment(F.T.meena, r.ticketId, a.id)).base64, 'base64').toString(), 'hello pdf');
  assert.throws(() => F.G.getTicketAttachment(F.T.joshua, r.ticketId, a.id), /do not have access/);
});

t('r54: ticket email follows the standard APS format and stays phone-readable', () => {
  const F = setup(); const G = F.G;
  const t = { Ticket_Number: 'APS-20261008-0007', Type: 'TECH SUPPORT', Subject: 'Meet link\r\nnot working', Student_Name: 'A Very Long Student Name That Goes On And On For Testing Purposes Only', APSID: 'APS1234',
    Classroom: 'NILAI 3 - EF | FRI 6:30 - 8:00 PM EST | AY26-27', Primary_Teacher: 'Teacher X', Priority: 'URGENT', Status: 'IN PROGRESS', Requester_Name: 'Parent Y', Created_At: '2026-10-08T16:30:43.028Z' };
  const parts = [{ Active: 'TRUE', Participant_Type: 'ASSIGNEE', Name: 'Info Desk', Email: 'info@x' }];
  const subj = G.tkSubject_('REPLY', t);
  assert.ok(subj.indexOf('[APS Ticket #APS-20261008-0007] New Reply - Tech Support - ') === 0, subj);
  assert.ok(subj.length <= 120 && !/[\r\n]/.test(subj));
  assert.ok(!/[\r\n]/.test(G.tkSubject_('CREATED', Object.assign({}, t, { Student_Name: '' }))), 'subject from a multi-line Subject is one line');
  { const st = G.tkSubject_('STATUS_CHANGED', t); assert.ok(st.indexOf('[APS Ticket #APS-20261008-0007] Status Updated: In Progress - Tech Support - A Very Long') === 0 && st.length <= 120 && /…$/.test(st), st); }
  const html = G.tkEmailHtml_('INTERNAL_NOTE', t, parts, 'x'.repeat(3500), true, { name: 'HM Z', email: 'hm@x' });
  ['Staff only.', 'Internal note from HM Z', 'Urgent priority', 'In Progress', 'Updated By', 'HM Z', 'Info Desk', 'shortened here', 'OPEN TICKET IN APS DASHBOARD', 'display:none'].forEach(x => assert.ok(html.includes(x), x));
  assert.ok(!html.includes('<script'), 'no script'); assert.ok(html.includes('table-layout:fixed'));
  const created = G.tkEmailHtml_('CREATED', Object.assign({}, t, { Student_Name: '', APSID: '', Classroom: '' }), [], 'hello', false, null);
  assert.ok(!created.includes('>Student<') && !created.includes('>Google Classroom<'), 'empty facts left out');
  assert.ok(created.includes('Not yet assigned'));
  const text = G.tkEmailText_('INTERNAL_NOTE', t, parts, 'note body', true, { name: 'HM Z' });
  assert.ok(/STAFF ONLY/.test(text) && /Internal note from HM Z:\nnote body/.test(text) && !/<[a-z]/i.test(text), text);
  // shell default (other APS emails) unchanged
  assert.ok(G.apsEmailShell_('x', 'body').includes('ACCESS APS DASHBOARD') && !G.apsEmailShell_('x', 'body').includes('display:none'));
});

console.log(pass + ' passed');

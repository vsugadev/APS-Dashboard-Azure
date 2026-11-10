const fs=require('fs'),vm=require('vm');const {makeContext}=require('./gasmock');const {courses,audit}=require('./fixtures');
function fd(iso){const N=new Date(iso).getTime();class D extends Date{constructor(...a){if(!a.length)super(N);else super(...a);}static now(){return N;}}return D;}
const env=makeContext({Date:fd('2026-09-28T11:00:00Z'),auditItems:audit});vm.runInContext(fs.readFileSync('../Code.gs','utf8'),env.ctx);
const sh=env.wb.insertSheet('Courses');sh.data[0]=new Array(18).fill('h');courses.forEach((c,i)=>{const r=new Array(18).fill('');r[0]=c.id;r[17]=JSON.stringify(c);sh.data[i+1]=r;});
env.ctx.syncAttendanceForAllCourses();
env.cache['aps_sess_t']=JSON.stringify({email:'t1@aps.org',role:'teacher'});
env.ctx.editAttendanceRecordStatus('t','700000000001','2026-09-25','s3@aps.org','STUDENT','EXCUSED','Doctor note provided by the parent today');
env.ctx.sendWeeklyAttendanceReports();
const m=env.stats.mails.find(x=>/MAZHALAI/.test(x.subject));
fs.writeFileSync('/home/claude/work/sample_attendance_report_email.html','<!doctype html><meta charset="utf-8"><title>'+m.subject+'</title>'+m.htmlBody);
console.log(m.subject,'| to:',m.to,'| cc:',m.cc);

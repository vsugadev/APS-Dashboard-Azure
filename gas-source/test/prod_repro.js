const fs=require('fs'),vm=require('vm');const {makeContext}=require('./gasmock');const {courses,audit}=require('./fixtures');
function fixedDate(iso){const N=new Date(iso).getTime();class D extends Date{constructor(...a){if(!a.length)super(N);else super(...a);}static now(){return N;}}return D;}
const env=makeContext({Date:fixedDate('2026-09-26T00:30:00Z'),auditItems:audit}); // Fri 8:30pm EDT, class in progress
vm.runInContext(fs.readFileSync('/mnt/user-data/uploads/APS-Classroom-Dashboard/CURRENT_PROD_CODE/Code.gs','utf8'),env.ctx);
const sh=env.wb.insertSheet('Courses');sh.data[0]=new Array(18).fill('h');courses.forEach((c,i)=>{const r=new Array(18).fill('');r[0]=c.id;r[17]=JSON.stringify(c);sh.data[i+1]=r;});
console.log('PROD sync 1:', JSON.stringify(env.ctx.syncAttendanceForAllCourses()));
console.log('PROD sync 2:', JSON.stringify(env.ctx.syncAttendanceForAllCourses()));
const rows=env.wb.sheets['AWK01ATT'].data.length-1; console.log('PROD AWK01ATT data rows after 2 syncs (roster=4):', rows);
const s1=env.wb.sheets['AWK01ATT'].data.slice(1).filter(r=>r[12]==='s1@aps.org').map(r=>r[19]); console.log('PROD s1 statuses (s1 attended the full class):', s1);
env.cache['aps_sess_t']=JSON.stringify({email:'admin@aps.org',role:'admin'});
try{const out=env.ctx.getAttendanceRecordsForViewer('t',{});console.log('PROD viewer returned', out.length, 'rows; first date type:', Object.prototype.toString.call(out[0].date));}catch(e){console.log('PROD viewer THREW:', e.message);}
try{env.ctx.editAttendanceRecordStatus('t','700000000001','2026-09-25','s3@aps.org','STUDENT','PRESENT','x');console.log('PROD edit ok');}catch(e){console.log('PROD edit THREW:', e.message);}

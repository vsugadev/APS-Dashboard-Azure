const fs=require('fs'),vm=require('vm');const {makeContext}=require('./gasmock');const {courses,audit}=require('./fixtures2');
function fd(iso){const N=new Date(iso).getTime();class D extends Date{constructor(...a){if(!a.length)super(N);else super(...a);}static now(){return N;}}return D;}
const env=makeContext({Date:fd('2026-09-28T16:00:00Z'),auditItems:audit});vm.runInContext(fs.readFileSync('../Code.gs','utf8'),env.ctx);
const sh=env.wb.insertSheet('Courses');sh.data[0]=new Array(18).fill('h');courses.forEach((c,i)=>{const r=new Array(18).fill('');r[0]=c.id;r[17]=JSON.stringify(c);sh.data[i+1]=r;});
const s=env.ctx.syncAttendanceForAllCourses(); console.log(JSON.stringify(s));

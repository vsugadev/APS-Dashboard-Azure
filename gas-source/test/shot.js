const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:760,height:1000}});
await p.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await p.goto('file:///home/claude/work/sample_attendance_report_email.html');await p.screenshot({path:'/home/claude/work/test/email.png',fullPage:true});await b.close();})();

// Copies gas-source/Dashboard.html into public/ (the page Azure serves), so Azure and Apps Script run the SAME page.
// Usage: npm run sync-dashboard   (refresh gas-source first with npm run sync-gas)
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const root = path.join(__dirname, '..');
const src = path.join(path.resolve(process.env.APS_GAS_PROJECT || path.join(root, 'gas-source')), 'Dashboard.html');
const dst = path.join(__dirname, '..', 'public', 'Dashboard.html');
if (!fs.existsSync(src)) { console.error('Not found: ' + src); process.exit(1); }
fs.copyFileSync(src, dst);
const md5 = crypto.createHash('md5').update(fs.readFileSync(dst)).digest('hex');
console.log('Copied Dashboard.html (' + fs.statSync(dst).size + ' bytes, md5 ' + md5 + ')');

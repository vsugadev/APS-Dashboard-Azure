// Refreshes gas-source/ — the read-only reference copy of the live Apps Script project used for porting and parity
// tests — from the Apps Script project folder. Secret files (ENV_VARIABLE_*.gs) are NEVER copied.
// Usage: npm run sync-gas    (default source: ../APS-Classroom-Dashboard; APS_GAS_PROJECT=<folder> to override)
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const root = path.join(__dirname, '..');
const from = path.resolve(process.env.APS_GAS_PROJECT || path.join(root, '..', 'APS-Classroom-Dashboard'));
const to = path.join(root, 'gas-source');
const FILES = ['Code.gs', 'Dashboard.html', 'PdfLib.gs', 'PortalBridge.gs', 'appsscript.json', 'APS_PropertyQuota_Fix.gs'];
if (!fs.existsSync(path.join(from, 'Code.gs'))) { console.error('Apps Script project not found: ' + from); process.exit(1); }
const snap = { copiedAt: new Date().toISOString(), from, files: {} };
for (const f of FILES) {
  if (/ENV_VARIABLE/i.test(f)) throw new Error('refusing to copy a secret file');
  const src = path.join(from, f);
  if (!fs.existsSync(src)) { console.warn('skipped (not found): ' + f); continue; }
  fs.copyFileSync(src, path.join(to, f));
  const md5 = crypto.createHash('md5').update(fs.readFileSync(src)).digest('hex');
  snap.files[f] = { bytes: fs.statSync(src).size, md5 };
  console.log('copied ' + f + '  ' + md5);
}
fs.writeFileSync(path.join(to, 'SNAPSHOT.json'), JSON.stringify(snap, null, 2) + '\n');
console.log('gas-source/ refreshed — now run: npm run sync-dashboard && npm test');

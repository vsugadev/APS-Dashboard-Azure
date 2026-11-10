#!/usr/bin/env node
/**
 * Builds aps_dashboard_Azure_prompt.txt =
 *   Part A: the generic APS Dashboard prompt, copied word for word from
 *           ..\APS-Classroom-Dashboard\CURRENT_PROD_CODE\aps_dashboard_generic_claude_prompt.txt
 *   Part B: the Azure migration rules in docs/prompt/azure_prompt_addendum.txt
 *
 * Runs automatically before `npm install` finishes, `npm run build`, `npm test` and `npm run dev`.
 *   npm run sync-prompt          one update
 *   npm run watch-prompt         keep updating whenever either source file changes
 *
 * CURRENT_PROD_CODE is only READ, never written. Override the source with APS_GENERIC_PROMPT=<path>.
 * If the source is not reachable (CI, Azure), the copy in docs/reference is used and nothing fails.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(process.env.APS_GENERIC_PROMPT ||
  path.join(ROOT, '..', 'APS-Classroom-Dashboard', 'CURRENT_PROD_CODE', 'aps_dashboard_generic_claude_prompt.txt'));
const REF = path.join(ROOT, 'docs', 'reference', 'aps_dashboard_generic_claude_prompt.txt');
const ADD = path.join(ROOT, 'docs', 'prompt', 'azure_prompt_addendum.txt');
const OUT = path.join(ROOT, 'aps_dashboard_Azure_prompt.txt');

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const isProd = (p) => /[\\/]CURRENT_PROD_CODE([\\/]|$)/i.test(p);

function writeIfChanged(file, buf) {
  if (isProd(file)) throw new Error('Refusing to write inside CURRENT_PROD_CODE: ' + file);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(buf)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return true;
}

function sync() {
  if (/ENV_VARIABLE/i.test(path.basename(SRC))) throw new Error('Refusing to read a secrets file: ' + SRC);
  let generic, from;
  if (fs.existsSync(SRC)) {
    generic = fs.readFileSync(SRC);
    from = SRC;
    if (writeIfChanged(REF, generic)) console.log('[sync-prompt] docs/reference copy updated from the generic prompt');
  } else if (fs.existsSync(REF)) {
    generic = fs.readFileSync(REF);
    from = 'docs/reference/aps_dashboard_generic_claude_prompt.txt (generic prompt not found at ' + SRC + ')';
  } else {
    console.warn('[sync-prompt] generic prompt not found; nothing to do');
    return;
  }
  const addendum = fs.readFileSync(ADD);

  // Keep the generic prompt's line endings (CRLF on Windows).
  const eol = generic.includes('\r\n') ? '\r\n' : '\n';
  const fix = (s) => s.replace(/\r?\n/g, eol);
  const header = fix([
    '##############################################################################',
    '# APS Dashboard — Azure Migration Master Prompt',
    '# GENERATED FILE — do not edit here. It is rebuilt by `npm run sync-prompt`.',
    '#   Part A source : ..\\APS-Classroom-Dashboard\\CURRENT_PROD_CODE\\aps_dashboard_generic_claude_prompt.txt',
    '#   Part A md5    : ' + md5(generic),
    '#   Part B source : docs\\prompt\\azure_prompt_addendum.txt',
    '#   Part B md5    : ' + md5(addendum),
    '##############################################################################',
    '',
    '# PART A — Generic APS Dashboard prompt (copied word for word; applies in full)',
    '',
    '',
  ].join('\n'));
  const sep = fix('\n\n==============================================================================\n\n');
  const body = Buffer.concat([
    Buffer.from(header, 'utf8'),
    generic,
    Buffer.from(sep, 'utf8'),
    Buffer.from(fix(addendum.toString('utf8')), 'utf8'),
  ]);
  const changed = writeIfChanged(OUT, body);
  console.log('[sync-prompt] ' + (changed ? 'updated' : 'up to date') + ': aps_dashboard_Azure_prompt.txt (Part A from ' + from + ')');
}

function main() {
  // Never touch files on the Azure web app or in CI builds.
  if (process.env.WEBSITE_SITE_NAME) return;
  try { sync(); } catch (e) {
    console.warn('[sync-prompt] skipped: ' + e.message);
    if (process.argv.includes('--strict')) process.exit(1);
  }
  if (process.argv.includes('--watch')) {
    console.log('[sync-prompt] watching for changes (Ctrl+C to stop)…');
    for (const f of [SRC, ADD]) {
      fs.watchFile(f, { interval: 2000 }, (cur, prev) => {
        if (cur.mtimeMs !== prev.mtimeMs) { try { sync(); } catch (e) { console.warn('[sync-prompt] ' + e.message); } }
      });
    }
  }
}

main();

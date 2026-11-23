/** v0.25.0: APS visual theme — CSS only; markup, scripts and behaviour unchanged; one place for the brand colour. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { DashboardPage, themeStyles, THEME_LINK, THEME_COLOR_MAP } from '../src/web/render';
import { loadConfig } from '../src/config';

const HTML = path.join(__dirname, '..', '..', 'public', 'Dashboard.html');
const CSS = path.join(__dirname, '..', '..', 'public', 'aps-theme.css');
const base = { authUrl: '#', token: null, user: null, error: null };
const scripts = (s: string) => (s.match(/<script\b[\s\S]*?<\/script>/gi) || []).join('\n');
const strip = (s: string) => s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<link rel="stylesheet" href="\/aps-theme\.css[^"]*">/, '');

test('theme on: the stylesheet is linked LAST in <head> (wins over the page styles); scripts and markup are byte-for-byte the same as theme off', () => {
  const on = new DashboardPage(HTML).render(base), off = new DashboardPage(HTML, { theme: false }).render(base);
  const m = on.match(/<link rel="stylesheet" href="\/aps-theme\.css\?v=([0-9a-f]{10})"><\/head>/); assert.ok(m, 'linked last in <head>, with the file hash'); assert.ok(!off.includes('aps-theme.css'));
  const hash = require('crypto').createHash('sha256').update(fs.readFileSync(CSS)).digest('hex').slice(0, 10); assert.equal(m![1], hash, 'a changed theme file gets a new address (never a stale browser copy)');
  assert.ok(on.lastIndexOf('</style>', on.indexOf('/aps-theme.css')) > -1, 'after the page styles');
  assert.equal(scripts(on), scripts(off), 'no script changed'); assert.equal(strip(on), strip(off), 'no markup changed');
});

test('the page\'s hard-coded brand blues (in <style> blocks only) point at the theme tokens and keep their old colour as fallback', () => {
  const on = new DashboardPage(HTML).render(base);
  const css = (on.replace(/<script\b[\s\S]*?<\/script>/gi, '').match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n'); // page styles, not HTML built by scripts
  for (const hex of Object.keys(THEME_COLOR_MAP)) assert.equal(new RegExp(hex + '(?![0-9a-f,)])', 'i').test(css), false, hex + ' left in a <style> block');
  assert.match(css, /var\(--aps-primary, #1a73e8\)/);
  const t = themeStyles('<style>a{color:#1A73E8}</style><script>x="<style>#1a73e8</style>"</script><div style="color:#1a73e8">');
  assert.equal(t, '<style>a{color:var(--aps-primary, #1a73e8)}</style><script>x="<style>#1a73e8</style>"</script><div style="color:#1a73e8">', 'scripts and attributes untouched');
  assert.equal(themeStyles('<style>a{color:#1a73e8ff}</style>'), '<style>a{color:#1a73e8ff}</style>', 'longer hex values untouched');
});

test('aps-theme.css: every colour is a token in :root (no scattered hard-coded colours); the required tokens exist', () => {
  const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')) + 1), rest = css.replace(root, '');
  for (const t of ['--aps-primary', '--aps-primary-light', '--aps-background', '--aps-surface', '--aps-text-primary', '--aps-text-secondary', '--aps-border', '--aps-success', '--aps-warning', '--aps-danger'])
    assert.match(root, new RegExp(t + ':'), t);
  const stray = (rest.match(/#[0-9a-f]{3,8}\b/gi) || []).filter((h) => !/^#(fff|ffffff|000|000000)$/i.test(h));
  assert.deepEqual(stray, [], 'hard-coded colours outside :root');
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|backdrop-filter|@keyframes/, 'no gradients, glass or animations');
});

test('AZURE_THEME: on by default; "off" serves the page exactly as Apps Script does', () => {
  assert.equal(loadConfig({} as any).theme, true); assert.equal(loadConfig({ AZURE_THEME: 'off' } as any).theme, false); assert.equal(loadConfig({ AZURE_THEME: 'aps' } as any).theme, true);
  const s = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'server.ts'), 'utf8'); assert.match(s, /new DashboardPage\([^)]*\), \{ theme: cfg\.theme \}\)/);
});

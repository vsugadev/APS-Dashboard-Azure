/*
 * Parallel run (v0.21.0) — a small bar on the Azure dashboard while Apps Script is still the official dashboard:
 * "Test run · Official dashboard · Report a difference". Loaded only when the app setting PARALLEL_RUN=on.
 * Reports go to azureReportDifference through the google.script.run shim (window.apsAzureReport): the server checks
 * the session and stores who / when / which screen / the text. Dashboard.html is not changed; no browser storage.
 */
(function () {
  'use strict';
  var me = document.currentScript, official = (me && me.getAttribute('data-official')) || '';
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }
  function screenName() {
    var all = document.querySelectorAll('[aria-selected="true"], .active[role="tab"], .tab.active, .nav-link.active'), names = [];
    for (var i = 0; i < all.length && names.length < 3; i++) { var r = all[i].getBoundingClientRect(); if (r.width && r.height) { var x = (all[i].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (x && names.indexOf(x) < 0) names.push(x); } }
    var t = names.join(' › ');
    return (t ? t.slice(0, 80) + ' ' : '') + (location.hash || '');
  }
  function start() {
    if (document.getElementById('apsParallelBar')) return;
    var css = el('style', {}, '#apsParallelBar{position:fixed;left:12px;bottom:12px;z-index:2147483000;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 24px);' +
      'background:#fff8e1;border:1px solid #f9ab00;border-radius:10px;padding:6px 10px;font:13px Arial,sans-serif;color:#202124;box-shadow:0 2px 8px rgba(0,0,0,.15)}' +
      '#apsParallelBar a,#apsParallelBar button{font:inherit;color:#1a73e8;background:none;border:0;padding:2px 4px;cursor:pointer;text-decoration:underline}' +
      '#apsParallelBar .x{color:#5f6368;text-decoration:none}#apsParallelBar.min .full{display:none}' +
      '#apsParallelDlg{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '#apsParallelDlg .box{background:#fff;border-radius:12px;max-width:520px;width:100%;padding:16px;font:14px Arial,sans-serif;color:#202124}' +
      '#apsParallelDlg textarea{width:100%;box-sizing:border-box;min-height:120px;font:inherit;margin:8px 0;padding:8px;border:1px solid #dadce0;border-radius:8px}' +
      '#apsParallelDlg input{width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border:1px solid #dadce0;border-radius:8px}' +
      '#apsParallelDlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}#apsParallelDlg button{font:inherit;padding:7px 14px;border-radius:8px;border:1px solid #dadce0;background:#fff;cursor:pointer}' +
      '#apsParallelDlg button.go{background:#1a73e8;color:#fff;border-color:#1a73e8}#apsParallelDlg .msg{font-size:13px;margin-top:6px}');
    document.head.appendChild(css);
    var bar = el('div', { id: 'apsParallelBar', role: 'region', 'aria-label': 'Test run' });
    bar.appendChild(el('span', {}, '🧪'));
    var full = el('span', { class: 'full' }, 'Test run of the new Azure dashboard.');
    bar.appendChild(full);
    if (official) { var a = el('a', { href: official, target: '_blank', rel: 'noopener', class: 'full' }, 'Official dashboard'); bar.appendChild(a); }
    var rep = el('button', { type: 'button' }, 'Report a difference'); bar.appendChild(rep);
    var x = el('button', { type: 'button', class: 'x', title: 'Make smaller', 'aria-label': 'Make smaller' }, '–'); bar.appendChild(x);
    x.addEventListener('click', function () { var m = bar.classList.toggle('min'); x.textContent = m ? '+' : '–'; });
    rep.addEventListener('click', openDialog);
    document.body.appendChild(bar);
  }
  function openDialog() {
    if (document.getElementById('apsParallelDlg')) return;
    var d = el('div', { id: 'apsParallelDlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Report a difference' }), box = el('div', { class: 'box' });
    box.appendChild(el('div', { style: 'font-weight:700;font-size:16px' }, 'Report a difference'));
    box.appendChild(el('div', { style: 'font-size:13px;color:#5f6368;margin-top:4px' }, 'What looks or works differently from the official dashboard? Please say what you expected and what you see. No passwords or private details, please.'));
    var scr = el('input', { type: 'text', maxlength: '200', 'aria-label': 'Screen' }); scr.value = screenName();
    box.appendChild(el('div', { style: 'font-size:12px;margin-top:10px' }, 'Screen / tab')); box.appendChild(scr);
    var ta = el('textarea', { maxlength: '2000', 'aria-label': 'Difference' }); box.appendChild(ta);
    var msg = el('div', { class: 'msg', 'aria-live': 'polite' }); box.appendChild(msg);
    var row = el('div', { class: 'row' }), cancel = el('button', { type: 'button' }, 'Close'), go = el('button', { type: 'button', class: 'go' }, 'Send');
    row.appendChild(cancel); row.appendChild(go); box.appendChild(row); d.appendChild(box); document.body.appendChild(d);
    function close() { d.remove(); }
    cancel.addEventListener('click', close);
    d.addEventListener('click', function (e) { if (e.target === d) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    go.addEventListener('click', function () {
      var text = ta.value.trim();
      if (text.length < 5) { msg.style.color = '#c5221f'; msg.textContent = 'Please describe the difference.'; return; }
      go.disabled = true; msg.style.color = '#5f6368'; msg.textContent = 'Sending…';
      if (typeof window.apsAzureReport !== 'function') { msg.style.color = '#c5221f'; msg.textContent = 'Reporting is not available on this page.'; go.disabled = false; return; }
      window.apsAzureReport({ text: text, screen: scr.value, userAgent: navigator.userAgent }, function (r) {
        msg.style.color = '#188038'; msg.textContent = 'Thank you — report #' + (r && r.id) + ' was sent to the APS team.'; ta.value = ''; go.disabled = false;
        setTimeout(close, 2500);
      }, function (err) { msg.style.color = '#c5221f'; msg.textContent = String(err && err.message || err); go.disabled = false; });
    });
    ta.focus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

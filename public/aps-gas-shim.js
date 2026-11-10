/*
 * google.script.run shim for the APS Dashboard on Azure.
 * Dashboard.html was written for Apps Script and calls google.script.run.withSuccessHandler(..).fn(args) — this file
 * provides the same object, sending each call to the Azure API (POST /api/run/<fn>) instead. Nothing in
 * Dashboard.html changes. Errors arrive as Error objects with the server's message, so SESSION_EXPIRED handling and
 * every failure handler behave as before. Loaded first in <head>.
 */
(function () {
  'use strict';
  function call(name, args, onOk, onErr, userObject, hasUser) {
    var done = false;
    function fail(msg) { if (done) return; done = true; if (typeof onErr === 'function') onErr(new Error(msg), hasUser ? userObject : undefined); }
    fetch('/api/run/' + encodeURIComponent(name), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-APS-Client': 'dashboard' },
      body: JSON.stringify({ args: args })
    }).then(function (res) {
      return res.json().catch(function () { return { err: 'Server error (' + res.status + ').' }; });
    }).then(function (r) {
      if (done) return;
      if (r && Object.prototype.hasOwnProperty.call(r, 'err')) { fail(String(r.err)); return; }
      done = true;
      if (typeof onOk === 'function') onOk(r ? r.ok : null, hasUser ? userObject : undefined);
    }).catch(function () { fail('Network error — please check your connection and try again.'); });
  }
  function runner(onOk, onErr, userObject, hasUser) {
    return new Proxy({}, {
      get: function (_t, prop) {
        if (prop === 'withSuccessHandler') return function (h) { return runner(h, onErr, userObject, hasUser); };
        if (prop === 'withFailureHandler') return function (h) { return runner(onOk, h, userObject, hasUser); };
        if (prop === 'withUserObject') return function (u) { return runner(onOk, onErr, u, true); };
        if (typeof prop !== 'string' || prop === 'then') return undefined;
        return function () { call(prop, Array.prototype.slice.call(arguments), onOk, onErr, userObject, hasUser); };
      }
    });
  }
  function params() {
    var p = {}, ps = {};
    new URLSearchParams(window.location.search).forEach(function (v, k) { if (!(k in p)) p[k] = v; (ps[k] = ps[k] || []).push(v); });
    return { parameter: p, parameters: ps };
  }
  window.google = window.google || {};
  window.google.script = {
    run: runner(null, null, undefined, false),
    url: { getLocation: function (cb) { var q = params(); cb({ hash: window.location.hash.replace(/^#/, ''), parameter: q.parameter, parameters: q.parameters }); } },
    history: {
      push: function (state, query, hash) { try { history.pushState(state || null, '', (query ? '?' + new URLSearchParams(query) : window.location.search) + (hash ? '#' + hash : '')); } catch (e) {} },
      replace: function (state, query, hash) { try { history.replaceState(state || null, '', (query ? '?' + new URLSearchParams(query) : window.location.search) + (hash ? '#' + hash : '')); } catch (e) {} },
      setChangeHandler: function (fn) { window.addEventListener('popstate', function (e) { var q = params(); fn({ state: e.state, location: { parameter: q.parameter, parameters: q.parameters, hash: window.location.hash.replace(/^#/, '') } }); }); }
    },
    host: { close: function () {}, setHeight: function () {}, setWidth: function () {}, editor: { focus: function () {} } }
  };
})();

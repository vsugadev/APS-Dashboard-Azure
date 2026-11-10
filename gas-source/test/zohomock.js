// r70: Zoho CRM v3 + accounts OAuth emulator for UrlFetchApp (node tests only).
// install(env, opts) → Z (state): Z.records, Z.fields, Z.calls, Z.puts, Z.failIds, Z.tokenFails, Z.expireTokenOnce …
function install(env, opts) {
  opts = opts || {};
  const Z = {
    module: { api_name: opts.moduleApi || 'Student_Contacts', plural_label: 'Student Contacts', singular_label: 'Student Contact' },
    fields: opts.fields || [
      { api_name: 'Student_APS_Email_Address', field_label: 'Student APS Email Address', data_type: 'email', length: 100 },
      { api_name: 'Google_Classroom_Full_Name', field_label: 'Google Classroom Full Name', data_type: 'text', length: 255 },
      { api_name: 'Teacher_Name', field_label: 'Teacher Name', data_type: 'text', length: 120 },
      { api_name: 'Teacher_Email_Address', field_label: 'Teacher Email Address', data_type: 'email', length: 100 },
      { api_name: 'Grade', field_label: 'Grade', data_type: 'picklist', length: 120, pick_list_values: ['Munmazhalai', 'Mazhalai', 'Nilai 1', 'Nilai 2', 'Nilai 3', 'Nilai 4', 'Nilai 5', 'Nilai 6', 'Nilai 7', 'Nilai 8'].map(v => ({ display_value: v, actual_value: v })) }
    ],
    records: [], calls: { token: 0, modules: 0, fields: 0, list: 0, ids: 0, put: 0 }, puts: [], requests: [], failIds: {}, tokenFails: false, expireTokenOnce: false, issued: 0, perPage: opts.perPage || 200
  };
  const props = env.ctx.PropertiesService.getScriptProperties();
  if (opts.configure !== false) { props.setProperty('ZOHO_CLIENT_ID', 'cid-SECRET-1234'); props.setProperty('ZOHO_CLIENT_SECRET', 'csecret-SECRET-5678'); props.setProperty('ZOHO_REFRESH_TOKEN', 'rtok-SECRET-9999'); }
  const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => body === undefined ? '' : JSON.stringify(body) });
  const prev = env.ctx.UrlFetchApp.fetch;
  env.ctx.UrlFetchApp.fetch = function (url, o) {
    o = o || {};
    if (!/zoho/.test(url)) return prev(url, o);
    if (url.length > 2082) throw new Error('Limit Exceeded: URLFetch URL Length.'); // real Apps Script limit
    Z.requests.push({ url, method: o.method, headers: o.headers || {}, payload: o.payload });
    if (url === 'https://accounts.zoho.com/oauth/v2/token') {
      Z.calls.token++;
      const p = o.payload || {};
      if (Z.tokenFails || p.refresh_token !== props.getProperty('ZOHO_REFRESH_TOKEN')) return resp(400, { error: 'invalid_code' });
      Z.issued++; return resp(200, { access_token: 'AT-' + Z.issued + '-SECRETTOKEN', expires_in: 3600 });
    }
    const auth = String((o.headers || {}).Authorization || '');
    if (!/^Zoho-oauthtoken AT-\d+-SECRETTOKEN$/.test(auth)) return resp(401, { code: 'INVALID_TOKEN' });
    if (Z.expireTokenOnce) { Z.expireTokenOnce = false; return resp(401, { code: 'INVALID_TOKEN', message: 'invalid oauth token' }); }
    const u = new URL(url), path = u.pathname.replace(/^\/crm\/v3/, '');
    if (path === '/settings/modules') { Z.calls.modules++; return resp(200, { modules: [{ api_name: 'Contacts', plural_label: 'Contacts' }, Z.module] }); }
    if (path === '/settings/fields') { Z.calls.fields++; return resp(200, { fields: Z.fields }); }
    if (path === '/' + Z.module.api_name + '/search') {
      Z.calls.search = (Z.calls.search || 0) + 1;
      const norm = v => String(v || '').replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF]+/g, '').toLowerCase();
      let hits = [];
      const crit = u.searchParams.get('criteria'), em = u.searchParams.get('email');
      if (crit) { const m = /^\((\w+):equals:(.*)\)$/.exec(crit); if (!m) return resp(400, { code: 'INVALID_QUERY' }); hits = Z.records.filter(r => norm(r[m[1]]) === norm(m[2].replace(/\\(.)/g, '$1'))); }
      else if (em) { const emailApis = Z.fields.filter(f => f.data_type === 'email').map(f => f.api_name).concat(Z.extraEmailFields || []); hits = Z.records.filter(r => emailApis.some(a => norm(r[a]) === norm(em))); }
      if (Z.hiddenFromList) hits = hits.concat([]); // search sees every record
      return hits.length ? resp(200, { data: hits.map(r => Object.assign({}, r)), info: { more_records: false } }) : resp(204);
    }
    if (path === '/' + Z.module.api_name && (o.method || 'get') === 'get') {
      const pick = r => { const f = (u.searchParams.get('fields') || '').split(',').filter(Boolean); const x = { id: r.id }; f.forEach(k => { if (k in r) x[k] = r[k]; }); return x; };
      if (u.searchParams.get('ids')) { Z.calls.ids++; const ids = u.searchParams.get('ids').split(','); if (ids.length > 100) return resp(400, { code: 'LIMIT_EXCEEDED' }); const d = Z.records.filter(r => ids.includes(r.id)).map(pick); return d.length ? resp(200, { data: d }) : resp(204); }
      Z.calls.list++;
      const per = Math.min(Number(u.searchParams.get('per_page') || 200), Z.perPage);
      const listed = Z.records.filter(r => !(Z.hiddenFromList || []).includes(r.id));
      const start = u.searchParams.get('page_token') ? Number(u.searchParams.get('page_token')) : (Number(u.searchParams.get('page') || 1) - 1) * per;
      if (!listed.length) return resp(204);
      const d = listed.slice(start, start + per).map(pick), more = start + per < listed.length;
      return resp(200, { data: d, info: { more_records: more, next_page_token: more && !Z.noPageToken ? String(start + per) : null, per_page: per, page: Math.floor(start / per) + 1 } });
    }
    if (path === '/' + Z.module.api_name && o.method === 'put') {
      Z.calls.put++;
      const body = JSON.parse(o.payload); Z.puts.push(body);
      if (body.data.length > 100) return resp(400, { code: 'LIMIT_EXCEEDED' });
      const out = body.data.map(d => {
        if (Z.failIds[d.id]) return { code: 'INVALID_DATA', status: 'error', message: Z.failIds[d.id], details: { api_name: Object.keys(d).filter(k => k !== 'id')[0] } };
        const rec = Z.records.find(r => r.id === d.id); if (!rec) return { code: 'INVALID_DATA', message: 'the id given seems to be invalid' };
        Object.keys(d).forEach(k => { if (k !== 'id') rec[k] = d[k]; });
        return { code: 'SUCCESS', status: 'success', details: { id: d.id } };
      });
      return resp(200, { data: out });
    }
    return resp(404, { code: 'INVALID_URL_PATTERN' });
  };
  return Z;
}
module.exports = { install };

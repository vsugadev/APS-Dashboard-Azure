// Minimal Apps Script service mocks for exercising the Attendance module end to end.
const vm = require('vm');
function fmt(date, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, weekday:'short' })
    .formatToParts(date).forEach(p => parts[p.type] = p.value);
  let H = Number(parts.hour) % 24;
  const map = { yyyy: parts.year, MM: parts.month, dd: parts.day, HH: String(H).padStart(2,'0'), mm: parts.minute, ss: parts.second };
  const dowIdx = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday) + 1;
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(parts.month)-1];
  // offset
  const asUtc = Date.UTC(+parts.year, +parts.month-1, +parts.day, H, +parts.minute, +parts.second);
  const offMin = Math.round((asUtc - Math.floor(date.getTime()/1000)*1000)/60000);
  const sign = offMin < 0 ? '-' : '+'; const a = Math.abs(offMin);
  const XXX = sign + String(Math.floor(a/60)).padStart(2,'0') + ':' + String(a%60).padStart(2,'0');
  return pattern.replace(/yyyy|MMM|MM|dd|HH|h|mm|ss|a|u|XXX|d/g, t => {
    switch (t) { case 'MMM': return mon; case 'h': return String((H%12)||12); case 'a': return H<12?'AM':'PM';
      case 'u': return String(dowIdx); case 'XXX': return XXX; case 'd': return String(Number(parts.day)); default: return map[t]; }
  });
}
class Range { constructor(sh,r,c,nr,nc){Object.assign(this,{sh,r,c,nr,nc});}
  getValues(){ const out=[]; for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++){const v=(this.sh.data[this.r-1+i]||[])[this.c-1+j];row.push(v===undefined?'':v);}out.push(row);} return out; }
  setValues(v){ if(this.c-1+this.nc>this.sh.maxCols) throw new Error('out of bounds cols'); for(let i=0;i<this.nr;i++){this.sh.data[this.r-1+i]=this.sh.data[this.r-1+i]||[];for(let j=0;j<this.nc;j++){let val=v[i][j]; const fmtText=this.sh.textFmt[(this.r-1+i)+':'+(this.c-1+j)];
      if(!fmtText && typeof val==='string'){ if(/^\d{4}-\d{2}-\d{2}$/.test(val)) val=new Date(val+'T00:00:00-04:00'); else if(/^\d{1,2}:\d{2} (AM|PM)$/.test(val)) val=new Date('1899-12-30T12:00:00Z'); }
      this.sh.data[this.r-1+i][this.c-1+j]=val;}} this.sh.writes++; return this; }
  setValue(v){ return this.setValues([[v]]); }
  setNumberFormat(f){ if(f==='@') for(let i=0;i<this.nr;i++)for(let j=0;j<this.nc;j++) this.sh.textFmt[(this.r-1+i)+':'+(this.c-1+j)]=true; return this; }
  setFontWeight(){return this;} clearContent(){ for(let i=0;i<this.nr;i++) this.sh.data[this.r-1+i]=[]; return this; }
  getSheet(){return this.sh;}
}
class Sheet { constructor(name){this.name=name;this.data=[];this.maxCols=26;this.textFmt={};this.writes=0;}
  getName(){return this.name;}
  setName(n){ const wb=this.wb; delete wb.sheets[this.name]; this.name=n; wb.sheets[n]=this; return this; } getLastRow(){ let n=0; this.data.forEach((r,i)=>{ if(r && r.some(v=>v!==''&&v!==undefined)) n=i+1;}); return n; }
  getLastColumn(){ let n=0; this.data.forEach(r=>{ (r||[]).forEach((v,j)=>{ if(v!==''&&v!==undefined) n=Math.max(n,j+1);});}); return n; }
  getMaxColumns(){return this.maxCols;} insertColumnsAfter(a,n){this.maxCols+=n;}
  getRange(r,c,nr,nc){ if(c-1+(nc||1)>this.maxCols) throw new Error('The coordinates of the range are outside the dimensions of the sheet.'); return new Range(this,r,c,nr||1,nc||1); }
  getDataRange(){ return new Range(this,1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn())); }
  appendRow(row){ this.data[this.getLastRow()]=row.slice(); } setFrozenRows(){}
}
class Workbook { constructor(){this.sheets={};} getSheetByName(n){return this.sheets[n]||null;} insertSheet(n){const sh=new Sheet(n); sh.wb=this; return this.sheets[n]=sh;}
  getSheets(){return Object.values(this.sheets);} getSpreadsheetTimeZone(){return 'America/New_York';} getUrl(){return 'u';} getId(){return this.__id || 'mock-wb-id';} }
/**
 * r53 — emulates the Google token endpoint + Gmail API send used by the attendance@ / donotreply@ senders.
 * Each Gmail send is decoded and pushed to stats.mails in MailApp-like shape ({to:'a,b', cc, replyTo, from, subject, htmlBody, body, via:'gmail'}).
 * opts.gmailAuthFail = true → the token endpoint refuses (invalid_grant); opts.gmailSendFail = HTTP code for every send.
 */
function gmailEmulator(url, opt, stats, opts) {
  if (/oauth2\.googleapis\.com\/token/.test(url)) {
    stats.tokenCalls = (stats.tokenCalls || 0) + 1;
    if (opts.gmailAuthFail) return { getResponseCode: () => 400, getContentText: () => JSON.stringify({ error: 'invalid_grant' }) };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'AT-' + Math.random().toString(36).slice(2), expires_in: 3600 }) };
  }
  if (/gmail\/v1\/users\/me\/messages\/send/.test(url)) {
    if (opts.gmailSendFail) return { getResponseCode: () => opts.gmailSendFail, getContentText: () => 'boom' };
    const raw = Buffer.from(JSON.parse(opt.payload).raw, 'base64url').toString('utf8');
    const head = raw.split('\r\n\r\n')[0];
    const hdr = n => ((head.match(new RegExp('^' + n + ': (.*)$', 'mi')) || [])[1] || '');
    const dec = v => v.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (m, b) => Buffer.from(b, 'base64').toString('utf8'));
    const parts = raw.split(/\r\n--aps_[0-9a-z]+(?:--)?/i);
    const part = type => { const p = parts.find(x => x.indexOf('Content-Type: ' + type) !== -1); if (!p) return ''; const b = p.split('\r\n\r\n')[1] || ''; return Buffer.from(b.trim(), 'base64').toString('utf8'); };
    const list = v => v.split(/,\s*/).filter(Boolean).join(',');
    const attachments = parts.filter(x => /Content-Disposition: attachment/.test(x)).map(x => ({ name: (/filename="([^"]*)"/.exec(x) || [])[1] || '', type: (/Content-Type: ([^;\r\n]+)/.exec(x) || [])[1] || '', base64: (x.split('\r\n\r\n')[1] || '').replace(/\s+/g, '') })); // r67
    const m = { via: 'gmail', attachments: attachments, from: dec(hdr('From')), to: list(hdr('To')), cc: list(hdr('Cc')), bcc: list(hdr('Bcc')), replyTo: list(hdr('Reply-To')), subject: dec(hdr('Subject')), body: part('text/plain'), htmlBody: part('text/html'), auth: opt.headers && opt.headers.Authorization };
    stats.quota -= m.to.split(',').length + (m.cc ? m.cc.split(',').length : 0);
    stats.mails.push(m);
    return { getResponseCode: () => 200, getContentText: () => '{}' };
  }
  return null;
}

function makeContext(opts) {
  const props = Object.assign({ ATTENDANCE_SPREADSHEET_ID:'ATT', ATTENDANCE_OAUTH_CLIENT_ID: 'att-client', ATTENDANCE_OAUTH_CLIENT_SECRET: 'att-secret', ATTENDANCE_REFRESH_TOKEN: 'att-refresh', TARGET_SPREADSHEET_ID:'TGT', ADMIN_EMAILS: JSON.stringify(['admin@aps.org']), HEADMASTER_EMAILS: JSON.stringify(['hm@aps.org']) }, opts.props||{});
  const cache = {}; const userProps = {}; // r103: the deploying account's User Properties (second store)
  const wb = new Workbook();
  const stats = { reportsCalls: 0, batchGet: 0, openById: 0, mails: [], quota: opts.quota === undefined ? 1500 : opts.quota, triggers: [] };
  const ctx = {
    console, JSON, Math, Date: opts.Date || Date, Object, String, Number, Array, RegExp, Error, isFinite, parseInt, encodeURIComponent,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k,v)=>{props[k]=String(v);}, deleteProperty: k=>{delete props[k];}, setProperties:(o)=>Object.assign(props,o), getKeys: () => Object.keys(props), getProperties: () => Object.assign({}, props) }), getUserProperties: () => ({ getProperty: k => (k in userProps ? userProps[k] : null), setProperty: (k,v)=>{userProps[k]=String(v);}, deleteProperty: k=>{delete userProps[k];}, getKeys: () => Object.keys(userProps), getProperties: () => Object.assign({}, userProps) }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k]||null, put: (k,v)=>{cache[k]=v;}, remove: k=>{delete cache[k];}, getAll: ks => { const o = {}; ks.forEach(k => { if (k in cache) o[k] = cache[k]; }); return o; }, putAll: o => { Object.keys(o).forEach(k => { cache[k] = o[k]; }); }, removeAll: ks => { ks.forEach(k => { delete cache[k]; }); } }) },
    LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){}, tryLock(){return true;} }) },
    Utilities: { formatDate: fmt, sleep(){}, getUuid: ()=>Math.random().toString(36).slice(2), computeHmacSha256Signature: (v, k) => Array.from(require('crypto').createHmac('sha256', String(k)).update(String(v)).digest()).map(b => b > 127 ? b - 256 : b) ,
      base64EncodeWebSafe: b => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64url'),
      base64Encode: b => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64'),
      base64Decode: s => Array.from(Buffer.from(String(s), 'base64')),
      newBlob: (data, mime, name) => { const bytes = typeof data === 'string' ? Array.from(Buffer.from(data, 'utf8')) : data; return { getBytes: () => bytes, getName: () => name, getContentType: () => mime, getDataAsString: () => Buffer.from(bytes.map(x => x & 255)).toString('utf8') }; } },
    SpreadsheetApp: { openById: id => { stats.openById++; return wb; }, create: name => { stats.created = (stats.created || 0) + 1; return wb; } },
    Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => { stats.batchGet++; if (opts.failBatchGet) throw new Error('boom');
      return { valueRanges: o.ranges.map(r => { const name = r.match(/^'(.*)'!/)[1].replace(/''/g,"'"); const sh = wb.sheets[name];
        const vals = sh.data.slice(1).filter(x=>x&&x.length).map(row => row.map(v => v instanceof Date ? (v.getTime()/86400000 + 25569 + (fmt(v,'America/New_York','XXX').startsWith('-04')? -4/24 : -5/24)) : v));
        // trim trailing empties like the API
        return { range: r, values: vals.map(row => { const a=row.slice(); while(a.length && (a[a.length-1]===''||a[a.length-1]===undefined)) a.pop(); return a; }) }; }) }; } } } },
    AdminReports: { Activities: { list: (u, app, o) => { stats.reportsCalls++; if (opts.failReports) throw new Error('Not Authorized to access this resource/api');
      const s = new Date(o.startTime).getTime(), e = new Date(o.endTime).getTime();
      return { items: (opts.auditItems||[]).filter(it => { const t = new Date(it.id.time).getTime(); return t >= s && t <= e; }) }; } } },
    AdminDirectory: { Users: { get: () => ({}) } },
    UrlFetchApp: { fetch: (url, opt) => gmailEmulator(url, opt, stats, opts) || ({ getResponseCode: () => 403, getContentText: () => 'denied' }) },
    ScriptApp: { WeekDay: { MONDAY: 'MONDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY' }, getOAuthToken: () => 't', getService: () => ({ getUrl: () => 'https://aps.test/exec' }),
      getProjectTriggers: () => stats.triggers.map(t => ({ getHandlerFunction: () => t.fn })), deleteTrigger: t => { stats.triggers = stats.triggers.filter(x => x.fn !== t.getHandlerFunction()); },
      newTrigger: fn => { const spec = { fn }; const b = { timeBased(){return b;}, everyMinutes(m){spec.everyMinutes=m;return b;}, everyHours(h){spec.everyHours=h;return b;}, onWeekDay(d){spec.weekDay=d;return b;}, everyDays(n){spec.everyDays=n;return b;}, after(ms){spec.after=ms;return b;}, atHour(h){spec.hour=h;return b;}, nearMinute(m){spec.minute=m;return b;}, inTimezone(z){spec.tz=z;return b;}, create(){ stats.triggers.push(spec); } }; return b; } },
    HtmlService: {}, Session: { getActiveUser: () => ({ getEmail: () => (stats.activeUser === undefined ? 'owner@aps.org' : stats.activeUser) }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) }, // r55: default = script owner in the editor; set stats.activeUser = '' to act as a web-app visitor
    MailApp: { sendEmail: p => { const n = p.to.split(',').length + (p.cc ? p.cc.split(',').length : 0); stats.quota -= n; stats.mails.push(p); }, getRemainingDailyQuota: () => stats.quota }, GmailApp: {}, DriveApp: {}, DocumentApp: {}, Classroom: {}, Logger: { log(){} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return { ctx, props, userProps, cache, wb, stats };
}
module.exports = { makeContext, fmt, Sheet };

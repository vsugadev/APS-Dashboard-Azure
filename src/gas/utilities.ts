/**
 * The part of Apps Script's Utilities.formatDate the copied helpers use, on Node's built-in time-zone data.
 * Java (SimpleDateFormat) letters supported: yyyy MMMM MMM MM M dd d EEEE EEE HH H hh h mm ss a u XXX, quoted 'text'.
 * Anything else throws, so an unsupported pattern can never pass silently.
 */
function parts(d: Date, tz: string): Record<string, string> {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short', timeZoneName: 'longOffset' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}
const DOW: Record<string, string> = { Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6', Sun: '7' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
export const Utilities = {
  formatDate(date: Date, tz: string, pattern: string): string {
    const p = parts(date, tz);
    const off = (p.timeZoneName || 'GMT').replace('GMT', '') || '+00:00';
    const H = Number(p.hour === '24' ? '0' : p.hour), h12 = H % 12 || 12, mon = Number(p.month);
    const map: Record<string, string> = {
      yyyy: p.year, MMMM: MONTHS[mon - 1], MMM: MONTHS[mon - 1].slice(0, 3), MM: p.month, M: String(mon), dd: p.day, d: String(Number(p.day)),
      EEEE: DAYS[p.weekday], EEE: p.weekday, HH: ('0' + H).slice(-2), H: String(H), hh: ('0' + h12).slice(-2), h: String(h12),
      mm: p.minute, ss: p.second, a: H < 12 ? 'AM' : 'PM', u: DOW[p.weekday], XXX: off === '+00:00' ? 'Z' : off,
    };
    let out = '';
    const re = /'([^']*)'|yyyy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|ss|a|u|XXX|[A-Za-z]|[^A-Za-z']+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pattern))) {
      const t = m[0];
      if (m[1] !== undefined) out += m[1] === '' ? "'" : m[1];
      else if (Object.prototype.hasOwnProperty.call(map, t)) out += map[t];
      else if (/^[A-Za-z]$/.test(t)) throw new Error('Utilities.formatDate: unsupported pattern ' + pattern);
      else out += t;
    }
    return out;
  },
};

/**
 * The part of Apps Script's Utilities.formatDate the copied helpers use, on Node's built-in time-zone data.
 * Patterns: 'yyyy-MM-dd', 'MM/dd HH:mm', 'u' (ISO day of week 1=Mon…7=Sun), 'XXX' (offset like -05:00), and
 * combinations of yyyy MM dd HH mm ss. Anything else throws, so an unsupported pattern can never pass silently.
 */
function parts(d: Date, tz: string): Record<string, string> {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short', timeZoneName: 'longOffset' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}
const DOW: Record<string, string> = { Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6', Sun: '7' };
export const Utilities = {
  formatDate(date: Date, tz: string, pattern: string): string {
    const p = parts(date, tz);
    const off = (p.timeZoneName || 'GMT').replace('GMT', '') || '+00:00';
    const map: Record<string, string> = { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour === '24' ? '00' : p.hour, mm: p.minute, ss: p.second, XXX: off === '+00:00' ? 'Z' : off, u: DOW[p.weekday] };
    const out = pattern.replace(/yyyy|MM|dd|HH|mm|ss|XXX|u/g, (t) => map[t]);
    if (/[a-zA-Z]/.test(out.replace(/[ZTe]/g, ''))) throw new Error('Utilities.formatDate: unsupported pattern ' + pattern);
    return out;
  },
};

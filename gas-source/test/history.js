// Builds Attendance history the way production does since the current-week-only rule (Oct 2026):
// one sync inside each week, the sheets carried from one run to the next. Returns the env of the LAST date.
const vm = require('vm');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } } return D; }
function buildHistory({ makeContext, code, opts, dates, seed }) {
  let prev = null, env = null;
  dates.forEach(d => {
    env = makeContext(Object.assign({}, opts || {}, { Date: fixedDate(d), props: prev ? prev.props : (opts && opts.props) }));
    vm.runInContext(code, env.ctx, { filename: 'Code.gs' });
    if (prev) { env.wb.sheets = prev.wb.sheets; Object.values(env.wb.sheets).forEach(s => { s.wb = env.wb; }); Object.assign(env.cache, prev.cache); }
    else seed(env);
    env.ctx.syncAttendanceForAllCourses();
    prev = env;
  });
  return env;
}
module.exports = { buildHistory, fixedDate };

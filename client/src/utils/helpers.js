export const r2 = v => Math.round(v * 100) / 100;

export const fMoney = (v, sign = false) =>
  (sign && v >= 0 ? '+' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fY = v => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  return a >= 1000 ? s + '$' + (a / 1000).toFixed(1) + 'k' : s + '$' + a.toFixed(0);
};

const MONTHS_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL  = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fDate(d) {
  if (!d) return '—';
  const p = d.split('/');
  return MONTHS_SHORT[+p[0]] + ' ' + parseInt(p[1]) + ', ' + p[2];
}

export function fDateFull(d) {
  if (!d) return '—';
  const p = d.split('/');
  return MONTHS_FULL[+p[0]] + ' ' + parseInt(p[1]) + ', ' + p[2];
}

export function isoToSlash(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-');
  return `${m}/${d}/${y}`;
}

export function slashToIso(s) {
  if (!s) return '';
  const p = s.split('/');
  return `${p[2]}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}`;
}

export function getESTToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

export function symBadgeClass(s) {
  const m = { NDXP: 'b-ndxp', NDX: 'b-ndx', NVDA: 'b-nvda', MSFT: 'b-msft' };
  return m[s] || 'b-default';
}

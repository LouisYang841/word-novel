// logger.js — 持久化调试日志（localStorage，容量上限，新→旧查看）
const KEY = 'wn:logs';
const CAP = 300;
let logs = null;

function load() {
  if (!logs) {
    try { logs = JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { logs = []; }
  }
  return logs;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(logs.slice(-CAP))); } catch { /* ignore */ }
}

export function log(level, tag, msg) {
  const entry = { t: Date.now(), level, tag, msg: String(msg).slice(0, 2000) };
  load().push(entry);
  if (logs.length > CAP) logs = logs.slice(-CAP);
  save();
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(`[${tag}]`, msg);
  return entry;
}

export const logInfo = (tag, msg) => log('info', tag, msg);
export const logWarn = (tag, msg) => log('warn', tag, msg);
export const logError = (tag, msg) => log('error', tag, msg);

export function getLogs() { return [...load()].reverse(); }
export function clearLogs() { logs = []; save(); }
export function logsAsText() {
  return load().map(e =>
    `${new Date(e.t).toISOString()} [${e.level}] [${e.tag}] ${e.msg}`
  ).join('\n');
}

// 捕获全局未处理错误（手机上没有 console，这是关键信息来源）
export function initGlobalErrorCapture() {
  window.addEventListener('error', e =>
    log('error', 'window', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno || '?'}`));
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    log('error', 'promise', (r && r.stack) ? r.stack : String(r));
  });
}

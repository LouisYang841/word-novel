// logview.js — 独立日志页
import { getLogs, clearLogs, logsAsText, onLog } from './logger.js';
import { showToast } from './toast.js';
import { downloadBlob } from './wordbook.js';

function el(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderList() {
  const entries = getLogs();
  el('log-count').textContent = entries.length ? `共 ${entries.length} 条` : '';
  const box = el('log-list');
  if (!entries.length) {
    box.innerHTML = '<p class="muted center" style="padding:1rem">还没有日志</p>';
    return;
  }
  box.innerHTML = entries.map(e => {
    const time = new Date(e.t).toLocaleTimeString('zh-CN', { hour12: false });
    return `<div class="log-entry ${e.level}"><span class="log-meta">${time} [${esc(e.tag)}]</span> ${esc(e.msg)}</div>`;
  }).join('');
}

export function renderLogView() { renderList(); }

export function initLogView() {
  el('log-copy').addEventListener('click', async () => {
    const text = logsAsText();
    if (!text) { showToast('日志是空的', { duration: 3000 }); return; }
    try {
      await navigator.clipboard.writeText(text);
      showToast(`已复制 ${text.split('\n').length} 条日志到剪贴板`, { type: 'ok', duration: 3000 });
    } catch {
      downloadBlob(text, 'word-novel-log.txt', 'text/plain');
      showToast('剪贴板不可用，已改为下载 log.txt', { duration: 4000 });
    }
  });
  el('log-clear').addEventListener('click', () => {
    if (!confirm('清空调试日志？')) return;
    clearLogs();
    renderList();
    showToast('日志已清空', { duration: 2500 });
  });
  // 新日志写入时实时刷新（仅当日志页可见）
  onLog(() => {
    if (!el('view-log').classList.contains('hidden')) renderList();
  });
}

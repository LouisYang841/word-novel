// toast.js — 页面内浮层提示
import { log } from './logger.js';

export function showToast(msg, { type = 'info', duration = 4000 } = {}) {
  log(type === 'error' ? 'error' : 'info', 'toast', msg);
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

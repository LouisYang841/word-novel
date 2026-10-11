// wordbook.js — 生词本视图
import { getWordbook, removeWord } from './store.js';
import { startReviewSession } from './practice.js';
import { escapeHtml } from './practice.js';

function el(id) { return document.getElementById(id); }

export function renderWordbook() {
  const list = getWordbook();
  el('wb-count').textContent = list.length;
  el('wb-empty').classList.toggle('hidden', list.length > 0);
  el('wb-practice').disabled = list.length === 0;
  el('wb-export').disabled = list.length === 0;

  const ul = el('wb-list');
  ul.innerHTML = '';
  const now = Date.now();
  list.forEach(w => {
    const li = document.createElement('li');
    const due = (w.reviewDue || 0) <= now;
    li.innerHTML = `
      <div class="w-main">
        <span class="w-word">${escapeHtml(w.word)}</span>
        <span class="w-pos">${escapeHtml(w.pos || '')}</span>
        ${due ? '<span class="due">· 待复习</span>' : ''}
        <div class="w-meaning">${escapeHtml(w.meaning || '')}</div>
        <div class="w-sent">${escapeHtml(w.sentence || '')}</div>
      </div>`;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '🗑';
    del.title = '删除';
    del.addEventListener('click', () => {
      removeWord(w.word);
      renderWordbook();
    });
    li.appendChild(del);
    ul.appendChild(li);
  });
}

export function initWordbook() {
  el('wb-practice').addEventListener('click', () => {
    const due = getWordbook().filter(w => (w.reviewDue || 0) <= Date.now());
    startReviewSession(due.length ? due : getWordbook());
  });
  el('wb-export').addEventListener('click', () => {
    const rows = [['word', 'pos', 'meaning', 'sentence', 'addedAt'],
      ...getWordbook().map(w => [w.word, w.pos, w.meaning, w.sentence,
        new Date(w.addedAt).toISOString().slice(0, 10)])];
    const csv = '\ufeff' + rows.map(r =>
      r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(csv, 'wordbook.csv', 'text/csv');
  });
}

export function downloadBlob(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

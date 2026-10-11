// stats.js — 统计视图
import { getStats, getWordbook, getBooks, get as storeGet } from './store.js';
import { escapeHtml } from './practice.js';

function el(id) { return document.getElementById(id); }

export function renderStats() {
  const s = getStats();
  const wb = getWordbook();
  const books = getBooks();

  const cOk = s.totals.cloze.ok + s.totals.choice.ok;
  const cBad = s.totals.cloze.bad + s.totals.choice.bad;
  const cTotal = cOk + cBad;
  const acc = cTotal ? Math.round(cOk / cTotal * 100) : 0;
  const exTotal = books.reduce((n, b) => n + storeGet(`book:${b.id}:exercises`, []).length, 0);

  const bar = (name, ok, bad) => {
    const total = ok + bad;
    const pct = total ? Math.round(ok / total * 100) : 0;
    return `<div class="bar-row">
      <span class="bar-name">${escapeHtml(name)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
      <span class="bar-val">${total ? pct + '% · ' + total + ' 题' : '—'}</span>
    </div>`;
  };

  const bookBars = books.map(b =>
    bar(b.name, ...bookAccuracy(b.id))
  ).join('');

  el('stats-body').innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell"><div class="num">${cTotal}</div><div class="lbl">累计答题</div></div>
      <div class="stat-cell"><div class="num">${acc}%</div><div class="lbl">总正确率</div></div>
      <div class="stat-cell"><div class="num">${s.streak || 0}<span style="font-size:.8rem"> 天</span></div><div class="lbl">连续练习</div></div>
      <div class="stat-cell"><div class="num">${wb.length}</div><div class="lbl">生词本</div></div>
    </div>
    <h2 style="margin:.8rem 0 .3rem">按模式</h2>
    ${bar('✏️ 填空', s.totals.cloze.ok, s.totals.cloze.bad)}
    ${bar('✅ 选择', s.totals.choice.ok, s.totals.choice.bad)}
    ${books.length ? `<h2 style="margin:.8rem 0 .3rem">按书籍（共 ${exTotal} 题）</h2>${bookBars}` : ''}
  `;
}

function bookAccuracy(bookId) {
  // 从 progress 汇总该书（按 exId 匹配）
  const s = getStats();
  let ok = 0, bad = 0;
  // progress 存的是最近 5000 条，直接扫
  try {
    const progress = JSON.parse(localStorage.getItem('wn:progress') || '[]');
    const exIds = new Set(storeGet(`book:${bookId}:exercises`, []).map(e => e.id));
    progress.forEach(p => {
      if (exIds.has(p.exId)) { p.correct ? ok++ : bad++; }
    });
  } catch { /* ignore */ }
  return [ok, bad];
}

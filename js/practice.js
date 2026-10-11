// practice.js — 练习流程控制、判分、进度记录
import { get as storeGet, getBooks, addProgress, getStats, saveStats, addWord } from './store.js';
import { aiGrade } from './ai.js';
import { currentBookId, ensureChunkQuestions } from './generate.js';

let session = null; // { mode, items, idx, results[] }

function el(id) { return document.getElementById(id); }

// ---------- 题目收集 ----------

export function collectPool() {
  // 题源下拉：全部 + 每本书
  const books = getBooks();
  const opts = [{ value: 'all', label: '全部书籍' },
    ...books.map(b => ({ value: b.id, label: b.name }))];
  const sel = el('prac-source');
  sel.innerHTML = '';
  opts.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value; opt.textContent = o.label;
    sel.appendChild(opt);
  });
}

function getExercises(sourceId) {
  const ids = sourceId === 'all' ? getBooks().map(b => b.id) : [sourceId];
  return ids.flatMap(id => storeGet(`book:${id}:exercises`, [])
    .map(e => ({ ...e, bookId: id })));
}

// ---------- 判分 ----------

export function normalize(s) {
  return s.trim().toLowerCase()
    .replace(/[.,!?;:'"]+$/g, '')
    .replace(/\s+/g, ' ');
}

function stem(w) {
  return w.replace(/(ies)$/, 'y').replace(/(es|s|ed|d|ing|ly)$/, '');
}

export function localGrade(input, answer) {
  const a = normalize(answer), i = normalize(input);
  if (i === a) return { correct: true, fuzzy: false };
  if (stem(i) === stem(a) && i && a) return { correct: true, fuzzy: true };
  return { correct: false, fuzzy: false };
}

export async function gradeCloze(input, ex) {
  const local = localGrade(input, ex.word);
  if (local.correct) return { ...local, note: local.fuzzy ? '拼写变体，按正确计' : '' };
  const settings = storeGet('settings', {});
  if (settings.aiGrading) {
    try {
      const r = await aiGrade(normalize(input), ex.word, ex.sentence);
      return { correct: !!r.correct, fuzzy: !!r.correct, note: r.note || '' };
    } catch (e) {
      console.error('AI grading failed', e);
    }
  }
  return { correct: false, fuzzy: false, note: '' };
}

// ---------- 会话 ----------

export async function startPractice(sourceId, mode, count) {
  let pool = getExercises(sourceId);
  // 做一块生一块：题不够时自动逐块生成（仅单本书来源；'all' 只用已生成的）
  if (pool.length < count && sourceId !== 'all') {
    const book = getBooks().find(b => b.id === sourceId);
    const loading = el('practice-loading');
    loading.classList.remove('hidden');
    el('practice-home').classList.add('hidden');
    el('practice-result').classList.add('hidden');
    try {
      const r = await ensureChunkQuestions(sourceId, count, (done, total) => {
        el('load-text').textContent = `《${book ? book.name : ''}》第 ${done}/${total} 块生成中…`;
        el('load-bar').style.width = (done / total * 100) + '%';
      });
      if (!r.ok && r.reason === 'nokey') {
        alert('请先到「设置」配置 AI 服务商和 API Key');
        location.hash = '#/settings';
        return;
      }
      if (!r.ok && r.reason === 'error') {
        alert('生成失败：' + r.error + '\n可稍后重试，已生成的题目仍然可用');
      }
    } finally {
      loading.classList.add('hidden');
    }
    pool = getExercises(sourceId);
  }
  if (!pool.length) {
    alert(sourceId === 'all'
      ? '还没有任何练习。请到书架选一本书进入详情页生成，或直接从单本书开始练习。'
      : '这本书还没有可用的练习，生成失败或内容为空。');
    return;
  }
  pool = shuffle(pool).slice(0, count);
  session = { mode, items: pool, idx: 0, results: [] };
  showQuiz();
  renderQuestion();
}

export function startReviewSession(words) {
  // 生词本复习：用生词原句构造选择题
  const items = shuffle(words).slice(0, 20).map(w => ({
    id: 'wb:' + w.word,
    word: w.word,
    pos: w.pos,
    meaning: w.meaning,
    sentence: w.sentence,
    cloze: w.sentence.replace(new RegExp(`\\b${escapeRe(w.word)}\\b`, 'i'), '____'),
    choices: [],
    answerIdx: -1,
    bookId: w.bookId,
    review: true,
  })).filter(e => e.cloze.includes('____'));
  if (!items.length) { alert('生词本词条缺少可用的原句'); return; }
  session = { mode: 'choice', items, idx: 0, results: [], review: true };
  showQuiz();
  renderQuestion();
}

function showQuiz() {
  el('practice-home').classList.add('hidden');
  el('practice-result').classList.add('hidden');
  el('practice-quiz').classList.remove('hidden');
}

function renderQuestion() {
  const s = session;
  const ex = s.items[s.idx];
  el('quiz-progress').textContent = `第 ${s.idx + 1} / ${s.items.length} 题`;
  el('quiz-bar').style.width = (s.idx / s.items.length * 100) + '%';

  el('quiz-pos').textContent = ex.pos ? `(${ex.pos})` : '';
  el('quiz-cloze').innerHTML = escapeHtml(ex.cloze).replace(
    /____/g, '<span class="blank" id="blank-slot">? ? ?</span>'
  );
  el('quiz-feedback').classList.add('hidden');
  el('quiz-feedback').className = 'feedback hidden';

  if (s.mode === 'choice') {
    // 复习题动态构造选项
    let choices = ex.choices;
    if (ex.review) {
      const wrongs = sampleDistractors(ex.word, 3);
      choices = shuffle([ex.word, ...wrongs]);
      ex.choices = choices;
      ex.answerIdx = choices.indexOf(ex.word);
    }
    renderChoice(ex, choices);
  } else {
    renderCloze(ex);
  }
}

function renderChoice(ex, choices) {
  el('quiz-cloze-input').classList.add('hidden');
  const box = el('quiz-choice-opts');
  box.classList.remove('hidden');
  box.innerHTML = '';
  choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.textContent = c;
    btn.addEventListener('click', () => {
      if (box.dataset.locked) return;
      box.dataset.locked = '1';
      const correct = i === ex.answerIdx;
      btn.classList.add('picked', correct ? 'right' : 'wrong');
      if (!correct) box.children[ex.answerIdx].classList.add('right');
      recordAnswer(ex, correct, c);
      showFeedback(correct, ex, correct ? '' : `正确答案：${ex.word}`);
      setTimeout(nextQuestion, 1400);
    });
    box.appendChild(btn);
  });
  delete box.dataset.locked;
}

function renderCloze(ex) {
  el('quiz-choice-opts').classList.add('hidden');
  el('quiz-choice-opts').innerHTML = '';
  el('quiz-cloze-input').classList.remove('hidden');
  const input = el('cloze-input');
  input.value = '';
  input.focus();
  const check = el('cloze-check');
  // 替换监听器：cloneNode 技巧
  const newCheck = check.cloneNode(true);
  check.parentNode.replaceChild(newCheck, check);
  newCheck.addEventListener('click', () => submitCloze(ex));
  input.onkeydown = (e) => { if (e.key === 'Enter') submitCloze(ex); };
}

async function submitCloze(ex) {
  const input = el('cloze-input');
  const value = input.value.trim();
  if (!value) return;
  const btn = el('cloze-check');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '判分中…';
  const result = await gradeCloze(value, ex);
  btn.disabled = false;
  btn.textContent = '检查';
  const slot = document.getElementById('blank-slot');
  if (slot) {
    slot.textContent = ex.word;
    slot.classList.add(result.correct ? 'ok' : 'bad');
  }
  recordAnswer(ex, result.correct, value);
  showFeedback(result.correct, ex,
    result.correct
      ? (result.note || '')
      : `正确答案：${ex.word}${ex.meaning ? ' · ' + ex.meaning : ''}${result.note ? '（' + result.note + '）' : ''}`);
  setTimeout(nextQuestion, result.correct ? 1000 : 2200);
}

function recordAnswer(ex, correct, userInput) {
  session.results.push({ ex, correct, userInput });
  addProgress([{ exId: ex.id, mode: session.mode, correct, userInput, at: Date.now() }]);
  if (!correct) {
    addWord({
      word: ex.word, pos: ex.pos, meaning: ex.meaning,
      sentence: ex.sentence, bookId: ex.bookId || null,
    });
  }
  // 更新统计
  const stats = getStats();
  const bucket = stats.totals[session.mode] || { ok: 0, bad: 0 };
  if (correct) bucket.ok++; else bucket.bad++;
  stats.totals[session.mode] = bucket;
  const today = new Date().toISOString().slice(0, 10);
  if (stats.lastPracticeDay !== today) {
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    stats.streak = stats.lastPracticeDay === yesterday ? stats.streak + 1 : 1;
    stats.lastPracticeDay = today;
  }
  saveStats(stats);
}

function showFeedback(correct, ex, detail) {
  const fb = el('quiz-feedback');
  fb.className = 'feedback ' + (correct ? 'ok' : 'bad');
  fb.innerHTML =
    (correct ? '✓ 正确！' : '✗ 不对') +
    `<div class="fb-detail"><strong>${escapeHtml(ex.word)}</strong> ${escapeHtml(ex.pos || '')} ${escapeHtml(ex.meaning || '')}` +
    (detail ? `<br>${escapeHtml(detail)}` : '') + '</div>';
  fb.classList.remove('hidden');
}

function nextQuestion() {
  session.idx++;
  if (session.idx >= session.items.length) {
    showResult();
  } else {
    renderQuestion();
  }
}

function showResult() {
  el('practice-quiz').classList.add('hidden');
  if (session.review) {
    import('./srs.js').then(m => m.applySessionSchedule(session.results));
  }
  const box = el('practice-result');
  box.classList.remove('hidden');
  const ok = session.results.filter(r => r.correct).length;
  const total = session.results.length;
  const pct = total ? Math.round(ok / total * 100) : 0;
  const rows = session.results.map(r => `
    <li>
      <span class="tag ${r.correct ? 'ok' : 'bad'}">${r.correct ? '✓' : '✗'}</span>
      <strong>${escapeHtml(r.ex.word)}</strong>
      ${r.correct ? '' : `<span class="muted">（你填了 ${escapeHtml(r.userInput || '—')}）</span>`}
      <div class="muted">${escapeHtml(r.ex.meaning || '')} · ${escapeHtml(r.ex.sentence)}</div>
    </li>`).join('');
  box.innerHTML = `
    <div class="card">
      <h2>练习结果</h2>
      <div class="result-score">${pct}<span style="font-size:1rem">%</span></div>
      <p class="muted center">答对 ${ok} / ${total}${session.review ? ' · 生词本复习' : ''}</p>
      <ul class="result-list">${rows}</ul>
      <div class="row gap">
        <button class="btn primary" id="result-again" style="flex:1">再来一轮</button>
        <button class="btn" id="result-back" style="flex:1">返回</button>
      </div>
    </div>`;
  document.getElementById('result-again').addEventListener('click', () => {
    const sourceId = el('prac-source').value;
    const mode = session.review ? 'choice' : session.mode;
    startPractice(sourceId, mode, Number(el('prac-count').value));
  });
  document.getElementById('result-back').addEventListener('click', showHome);
}

export function showHome() {
  session = null;
  el('practice-quiz').classList.add('hidden');
  el('practice-result').classList.add('hidden');
  el('practice-home').classList.remove('hidden');
  renderReviewBanner();
}

function renderReviewBanner() {
  const banner = el('review-banner');
  const words = storeGet('wordbook', []).filter(w => (w.reviewDue || 0) <= Date.now());
  if (!words.length) { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  banner.innerHTML = `🔔 有 ${words.length} 个生词到了复习时间
    <br><button class="btn primary" id="review-start">开始复习</button>`;
  document.getElementById('review-start').addEventListener('click', () => {
    import('./srs.js').then(m => m.startReview());
  });
}

// ---------- utils ----------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sampleDistractors(word, n) {
  // 从全部练习的词里抽同难度级别的干扰项
  const all = new Set();
  getBooks().forEach(b => {
    storeGet(`book:${b.id}:exercises`, []).forEach(e => all.add(e.word));
  });
  all.delete(word);
  const arr = [...all];
  const picked = [];
  while (picked.length < n && arr.length) {
    picked.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]);
  }
  while (picked.length < n) picked.push('—');
  return picked;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function initPractice() {
  document.getElementById('prac-start').addEventListener('click', () => {
    const sourceId = el('prac-source').value;
    const mode = el('prac-mode').value;
    const count = Number(el('prac-count').value);
    startPractice(sourceId, mode, count);
  });
}

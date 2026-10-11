// generate.js — 生成流水线：分批、进度、可中断、按块重生成
import { getBook, get as storeGet, set as storeSet, getSettings, getWordbook, getBooks, saveBooks } from './store.js';
import { generateWords } from './ai.js';
import { showToast } from './toast.js';
import { logInfo, logError } from './logger.js';

let running = false;
let abortFlag = false;

export function isRunning() { return running; }

function el(id) { return document.getElementById(id); }

export function renderBookView(bookId) {
  const book = getBook(bookId);
  if (!book) return;
  el('book-title').textContent = book.name;
  el('book-meta').textContent =
    `${formatLen(book.textLength)} · ${book.chunkCount} 块`;
  renderChunks(bookId);
}

function formatLen(n) {
  return n > 10000 ? (n / 10000).toFixed(1) + ' 万字符' : n + ' 字符';
}

function renderChunks(bookId) {
  const chunks = storeGet(`book:${bookId}:chunks`, []);
  const exs = storeGet(`book:${bookId}:exercises`, []);
  el('ex-count').textContent = exs.length;
  const done = chunks.filter(c => c.status === 'done').length;
  el('gen-status').textContent = `已完成 ${done}/${chunks.length} 块`;
  el('gen-progress').classList.toggle('hidden', !running && done === chunks.length);
  if (!running) {
    el('gen-bar').style.width = (chunks.length ? done / chunks.length * 100 : 0) + '%';
  }
  const list = el('chunk-list');
  list.innerHTML = '';
  chunks.forEach(c => {
    const chip = document.createElement('button');
    chip.className = 'chunk-chip ' + c.status;
    chip.textContent = `#${c.index + 1}${c.status === 'done' ? ' ✓' : c.status === 'failed' ? ' ✗' : ''}`;
    chip.title = c.status === 'done' ? '点击重新生成本块' : '点击生成本块';
    chip.addEventListener('click', () => {
      if (running) return;
      startGeneration(bookId, c.index);
    });
    list.appendChild(chip);
  });
}

export function startGeneration(bookId, onlyChunk = null) {
  if (running) return;
  const settings = getSettings();
  const configured = settings.provider === 'gemini' ? settings.geminiKey : settings.apiKey;
  if (!configured) {
    showToast('请先到「设置」配置 AI 服务商和 API Key', { type: 'error', duration: 5000 });
    location.hash = '#/settings';
    return;
  }
  running = true;
  abortFlag = false;
  el('gen-start').classList.add('hidden');
  el('gen-stop').classList.remove('hidden');
  el('gen-progress').classList.remove('hidden');

  const level = el('gen-level').value;
  const count = Number(el('gen-batch').value);
  const chunks = storeGet(`book:${bookId}:chunks`, []);
  const targets = onlyChunk !== null ? chunks.filter(c => c.index === onlyChunk)
    : chunks.filter(c => c.status !== 'done');
  const total = targets.length;

  (async () => {
    let ok = 0;
    for (let i = 0; i < total; i++) {
      const chunk = targets[i];
      const pct = Math.round(i / total * 100);
      el('gen-bar').style.width = pct + '%';
      el('gen-status').textContent = `第 ${i + 1}/${total} 块生成中…`;
      try {
        const text = storeGet(`book:${bookId}:text`, '');
        const chunkText = text.slice(chunk.start, chunk.end);
        const words = await generateWords(chunkText, {
          level, count, customPrompt: settings.customPrompt,
        });
        appendExercises(bookId, chunk.index, words);
        chunk.status = 'done';
        chunk.failedMsg = null;
        ok++;
        logInfo('gen', `批量: 块 #${chunk.index + 1} 完成, +${words.length} 词`);
      } catch (e) {
        console.error(e);
        chunk.status = 'failed';
        chunk.failedMsg = String(e.message || e);
        logError('gen', `批量: 块 #${chunk.index + 1} 失败: ${chunk.failedMsg}`);
        showToast(`第 ${chunk.index + 1} 块生成失败：${chunk.failedMsg}`, { type: 'error', duration: 8000 });
      }
      // 每块完成即落盘（可断点续传）
      storeSet(`book:${bookId}:chunks`, chunks);
      renderChunks(bookId);
      if (abortFlag) break;
    }
    running = false;
    el('gen-start').classList.remove('hidden');
    el('gen-stop').classList.add('hidden');
    el('gen-bar').style.width = '100%';
    el('gen-status').textContent = abortFlag
      ? `已停止（本轮完成 ${ok} 块）`
      : `生成完成：成功 ${ok}/${total} 块` + (ok < total ? '，失败块可点击 ✗ 重试' : '');
  })();
}

function appendExercises(bookId, chunkIndex, words) {
  // 跳过生词本和已生成里已有的词
  const existing = new Set(
    storeGet(`book:${bookId}:exercises`, []).map(e => e.word)
  );
  getWordbook().forEach(e => existing.add(e.word.toLowerCase()));
  const fresh = words.filter(w => !existing.has(w.word));
  if (!fresh.length) return;

  const exs = storeGet(`book:${bookId}:exercises`, []);
  for (const w of fresh) {
    const choices = shuffle([w.word, ...w.distractors.slice(0, 3)]);
    while (choices.length < 4) choices.push('(无)');
    exs.push({
      id: 'ex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      word: w.word,
      pos: w.pos,
      meaning: w.meaning,
      sentence: w.sentence,
      cloze: w.cloze,
      choices,
      answerIdx: choices.indexOf(w.word),
      difficulty: w.difficulty,
      chunkIndex,
    });
    existing.add(w.word);
  }
  storeSet(`book:${bookId}:exercises`, exs);
  // 更新书架上的练习计数缓存
  const books = getBooks();
  const b = books.find(x => x.id === bookId);
  if (b) { b.exCount = exs.length; saveBooks(books); }
}

export function initGenerate() {
  el('gen-start').addEventListener('click', () => {
    const bookId = currentBookId();
    if (bookId) startGeneration(bookId);
  });
  el('gen-stop').addEventListener('click', () => { abortFlag = true; });
}

export function currentBookId() {
  const m = location.hash.match(/^#\/book\/(.+)$/);
  return m ? m[1] : null;
}

// 按需生成：确保某本书至少有 minCount 道题，逐块生成直到够数或无块可生
// onlyChunkIndex 非空时只补生成该块（若未生成）
// 返回 { ok, reason? }；reason: 'busy' | 'nokey' | 'error'
export async function ensureChunkQuestions(bookId, minCount, onProgress, onlyChunkIndex = null) {
  if (running) return { ok: false, reason: 'busy' };
  const settings = getSettings();
  const configured = settings.provider === 'gemini' ? settings.geminiKey : settings.apiKey;
  if (!configured) return { ok: false, reason: 'nokey' };

  const level = document.getElementById('gen-level')?.value || 'CET-4';
  const count = Number(document.getElementById('gen-batch')?.value) || 8;

  while (true) {
    const cs = storeGet(`book:${bookId}:chunks`, []);
    const chunk = cs.find(c => c.status !== 'done'
      && (onlyChunkIndex === null || c.index === onlyChunkIndex));
    if (!chunk) return { ok: true }; // 没有可生成的块了，用现有题目
    // 全书模式：题够了就停；指定块模式：只看该块状态，不看全书题数
    if (onlyChunkIndex === null
      && storeGet(`book:${bookId}:exercises`, []).length >= minCount) return { ok: true };
    onProgress?.(chunk.index + 1, cs.length);
    try {
      const text = storeGet(`book:${bookId}:text`, '');
      const words = await generateWords(text.slice(chunk.start, chunk.end), {
        level, count, customPrompt: settings.customPrompt,
      });
      appendExercises(bookId, chunk.index, words);
      chunk.status = 'done';
      logInfo('gen', `按需: 块 #${chunk.index + 1} 完成, +${words.length} 词`);
    } catch (e) {
      console.error(e);
      chunk.status = 'failed';
      chunk.failedMsg = String(e.message || e);
      logError('gen', `按需: 块 #${chunk.index + 1} 失败: ${chunk.failedMsg}`);
      storeSet(`book:${bookId}:chunks`, cs);
      return { ok: false, reason: 'error', error: String(e.message || e) };
    }
    storeSet(`book:${bookId}:chunks`, cs);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// store.js — localStorage 封装（wn: 前缀）
const PREFIX = 'wn:';

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('localStorage write failed', e);
    alert('存储失败：浏览器空间不足，请删除一些书籍或清空数据。');
    return false;
  }
}

export function remove(key) {
  localStorage.removeItem(PREFIX + key);
}

// ---- settings ----
export const DEFAULT_SETTINGS = {
  provider: 'openai',        // 'openai' | 'gemini'
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  geminiKey: '',
  geminiModel: 'gemini-2.0-flash',
  aiGrading: false,
  customPrompt: '',
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...get('settings', {}) };
}

export function saveSettings(patch) {
  const s = { ...getSettings(), ...patch };
  set('settings', s);
  return s;
}

// ---- books ----
export function getBooks() { return get('books', []); }
export function saveBooks(books) { set('books', books); }
export function getBook(id) { return getBooks().find(b => b.id === id) || null; }
export function deleteBook(id) {
  saveBooks(getBooks().filter(b => b.id !== id));
  remove(`book:${id}:text`);
  remove(`book:${id}:chunks`);
  remove(`book:${id}:exercises`);
}

// ---- progress / stats / wordbook ----
export function getProgress() { return get('progress', []); }
export function addProgress(entries) {
  const p = getProgress().concat(entries).slice(-5000);
  set('progress', p);
}

export function getStats() {
  return get('stats', {
    streak: 0, lastPracticeDay: null,
    totals: { cloze: { ok: 0, bad: 0 }, choice: { ok: 0, bad: 0 } },
  });
}
export function saveStats(s) { set('stats', s); }

export function getWordbook() { return get('wordbook', []); }
export function saveWordbook(list) { set('wordbook', list); }
export function addWord(wordEntry) {
  const list = getWordbook();
  const w = wordEntry.word.toLowerCase();
  if (list.some(e => e.word.toLowerCase() === w)) return false;
  list.push({ ...wordEntry, addedAt: Date.now(), reviewDue: Date.now(), box: 1 });
  saveWordbook(list);
  return true;
}
export function removeWord(word) {
  saveWordbook(getWordbook().filter(e => e.word !== word));
}

// ---- data export / import / wipe ----
export function exportAll() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
  }
  return { app: 'word-novel', version: 1, exportedAt: new Date().toISOString(), data };
}

export function importAll(payload) {
  if (!payload || payload.app !== 'word-novel' || typeof payload.data !== 'object') {
    throw new Error('文件格式不对，不是 Word Novel 导出的数据');
  }
  for (const [k, v] of Object.entries(payload.data)) {
    localStorage.setItem(k, v);
  }
}

export function wipeAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}

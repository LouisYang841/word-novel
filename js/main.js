// main.js — 入口 + hash 路由
import { getBooks, deleteBook, getBook } from './store.js';
import { initUpload } from './upload.js';
import { initGenerate, renderBookView, currentBookId } from './generate.js';
import { initPractice, showHome, collectPool, escapeHtml } from './practice.js';
import { initWordbook, renderWordbook } from './wordbook.js';
import { renderStats } from './stats.js';
import { initSettings } from './settings.js';
import { dueCount } from './srs.js';
import { initGlobalErrorCapture, logInfo } from './logger.js';

const $ = (id) => document.getElementById(id);

const VIEWS = ['upload', 'book', 'practice', 'wordbook', 'stats', 'settings'];
const TABS = ['upload', 'practice', 'wordbook', 'stats', 'settings'];
const TITLES = {
  upload: '📚 Word Novel',
  book: '📖 书籍详情',
  practice: '✏️ 练习',
  wordbook: '⭐ 生词本',
  stats: '📊 统计',
  settings: '⚙️ 设置',
};

function route() {
  const hash = location.hash || '#/upload';
  const m = hash.match(/^#\/(\w+)(?:\/(.+))?$/);
  const view = m && VIEWS.includes(m[1]) ? m[1] : 'upload';
  const param = m ? m[2] : null;

  VIEWS.forEach(v => $('view-' + v).classList.toggle('hidden', v !== view));

  // tab 高亮 & 子页面 chrome
  TABS.forEach(t => {
    const tab = document.querySelector(`.tab[data-tab="${t}"]`);
    tab.classList.toggle('active', t === view);
  });
  const isSub = view === 'book';
  $('tabbar').classList.toggle('hidden', isSub);
  $('back-btn').classList.toggle('hidden', !isSub);

  $('view-title').textContent = TITLES[view] || TITLES.upload;

  // 视图刷新钩子
  if (view === 'upload') renderBookList();
  if (view === 'book') {
    if (param) sessionStorage.setItem('wn:bookId', param);
    const bookId = param || currentBookId();
    const book = bookId && getBook(bookId);
    if (book) renderBookView(book.id);
    else location.hash = '#/upload';
  }
  if (view === 'practice') { collectPool(); showHome(); }
  if (view === 'wordbook') renderWordbook();
  if (view === 'stats') renderStats();
}

// ---------- 书架列表 ----------
function renderBookList() {
  const books = getBooks();
  $('book-empty').classList.toggle('hidden', books.length > 0);
  const ul = $('book-list');
  ul.innerHTML = '';
  books.forEach(b => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span style="font-size:1.4rem">📕</span>
      <div class="bk-info">
        <div class="bk-name">${escapeHtml(b.name)}</div>
        <div class="muted">${b.chunkCount} 块 · ${b.exCount || 0} 题</div>
      </div>`;
    li.addEventListener('click', () => { location.hash = '#/book/' + b.id; });
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '🗑';
    del.title = '删除这本书';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`删除《${b.name}》？书籍文本和练习都会删除。`)) return;
      deleteBook(b.id);
      renderBookList();
    });
    li.appendChild(del);
    ul.appendChild(li);
  });
  // 练习 tab 上显示待复习数
  const due = dueCount();
  const practiceTab = document.querySelector('.tab[data-tab="practice"]');
  practiceTab.innerHTML = due
    ? `🔔<span>练习${due}</span>` : '✏️<span>练习</span>';
}

// ---------- init ----------
function init() {
  initGlobalErrorCapture();
  logInfo('app', '启动, hash=' + location.hash);
  initUpload({ onDone: (book) => { location.hash = '#/book/' + book.id; } });
  initGenerate();
  initPractice();
  initWordbook();
  initSettings();

  $('back-btn').addEventListener('click', () => { location.hash = '#/upload'; });
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      location.hash = '#/' + tab.dataset.tab;
    });
  });

  window.addEventListener('hashchange', route);
  route();
}

init();

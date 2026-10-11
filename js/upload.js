// upload.js — txt 上传、编码检测、分块
import { getBooks, saveBooks, set as storeSet } from './store.js';

// 块大小对齐常见阅读理解语篇（~500 词），避免一次喂给 AI 太长
const CHUNK_SIZE = 3000;
const MIN_CHUNK = 1200;

export function initUpload({ onDone }) {
  const fileInput = document.getElementById('file-input');
  const preview = document.getElementById('upload-preview');
  const previewName = document.getElementById('preview-name');
  const previewSize = document.getElementById('preview-size');
  const previewText = document.getElementById('preview-text');
  const confirmBtn = document.getElementById('confirm-upload');
  const cancelBtn = document.getElementById('cancel-upload');

  let pending = null; // { name, text }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const text = decodeText(buf);
    if (!text.trim()) { alert('文件是空的或无法解码'); return; }
    pending = { name: file.name.replace(/\.txt$/i, ''), text };
    previewName.textContent = pending.name;
    previewSize.textContent = formatSize(file.size);
    previewText.textContent = text.slice(0, 600) + (text.length > 600 ? '…' : '');
    preview.classList.remove('hidden');
    fileInput.value = '';
  });

  cancelBtn.addEventListener('click', () => {
    pending = null;
    preview.classList.add('hidden');
  });

  confirmBtn.addEventListener('click', () => {
    if (!pending) return;
    const book = createBook(pending.name, pending.text);
    pending = null;
    preview.classList.add('hidden');
    onDone(book);
  });
}

// UTF-8 优先，乱码率过高则回退 GBK
function decodeText(buf) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  if (bad > utf8.length * 0.005) {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch { /* fall through */ }
  }
  return utf8;
}

function createBook(name, text) {
  const chunks = splitChunks(text);
  const book = {
    id: 'bk' + Date.now().toString(36),
    name,
    textLength: text.length,
    chunkCount: chunks.length,
    createdAt: Date.now(),
  };
  const books = getBooks();
  books.unshift(book);
  saveBooks(books);
  storeSet(`book:${book.id}:text`, text);
  storeSet(`book:${book.id}:chunks`, chunks.map((c, i) => ({
    index: i, start: c.start, end: c.end, status: 'pending',
  })));
  storeSet(`book:${book.id}:exercises`, []);
  return book;
}

// 按段落边界切 ~3000 字符的块；向后找边界，块大小永不超过 CHUNK_SIZE
export function splitChunks(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= CHUNK_SIZE) {
      chunks.push({ start, end: text.length });
      break;
    }
    const sub = text.slice(start, start + CHUNK_SIZE);
    let cut = -1;
    // 优先取块内最后一个段落边界
    cut = sub.lastIndexOf('\n\n');
    if (cut < MIN_CHUNK) cut = sub.lastIndexOf('\n');
    // 其次句子边界
    if (cut < MIN_CHUNK) {
      const s = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('? '), sub.lastIndexOf('! '));
      if (s >= MIN_CHUNK) cut = s + 1;
    }
    const end = start + (cut >= MIN_CHUNK ? cut + 1 : CHUNK_SIZE);
    chunks.push({ start, end });
    start = end;
  }
  return chunks;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

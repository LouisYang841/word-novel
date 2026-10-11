// srs.js — 极简 Leitner：box 1-3，答对 2d/7d/30d，答错明天
import { getWordbook, saveWordbook } from './store.js';
import { startReviewSession } from './practice.js';

const INTERVALS = [2, 7, 30]; // days, box index 0-2

export function scheduleResult(word, correct) {
  const list = getWordbook();
  const entry = list.find(e => e.word === word);
  if (!entry) return;
  entry.box = correct
    ? Math.min(3, (entry.box || 1) + 1)
    : 1;
  const days = correct ? INTERVALS[(entry.box || 1) - 1] : 1;
  entry.reviewDue = Date.now() + days * 864e5;
  saveWordbook(list);
}

// 练习结束后调用：把本次复习结果套用调度
export function applySessionSchedule(results) {
  results.forEach(r => {
    if (r.ex && r.ex.review) scheduleResult(r.ex.word, r.correct);
  });
}

export function dueCount() {
  const now = Date.now();
  return getWordbook().filter(w => (w.reviewDue || 0) <= now).length;
}

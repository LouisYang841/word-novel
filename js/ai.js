// ai.js — provider 抽象：OpenAI 兼容 + Gemini 原生
import { getSettings } from './store.js';
import { logInfo, logWarn, logError } from './logger.js';

// ---------- 统一调用接口 ----------

export async function chat(messages, { jsonMode = true, temperature = 0.7 } = {}) {
  const s = getSettings();
  const model = s.provider === 'gemini' ? (s.geminiModel || 'gemini-2.0-flash') : (s.model || '?');
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  const t0 = Date.now();
  logInfo('ai', `→ ${s.provider} ${model} json=${jsonMode} prompt≈${promptChars} chars`);
  try {
    const out = s.provider === 'gemini'
      ? await geminiChat(messages, s, { jsonMode, temperature })
      : await openaiChat(messages, s, { jsonMode, temperature });
    logInfo('ai', `← OK ${Date.now() - t0}ms resp=${out.length} chars`);
    logInfo('ai', `原始返回: ${truncate(out, 1500)}`);
    return out;
  } catch (e) {
    logError('ai', `✗ FAIL ${Date.now() - t0}ms ${e.message || e}`);
    throw e;
  }
}

async function openaiChat(messages, s, { jsonMode, temperature }) {
  if (!s.apiKey) throw new Error('未配置 API Key，请到「设置」填写');
  const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({
      model: s.model,
      messages,
      temperature,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${truncate(body, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回为空');
  return content;
}

async function geminiChat(messages, s, { jsonMode, temperature }) {
  if (!s.geminiKey) throw new Error('未配置 Gemini 兼容 API Key，请到「设置」填写');
  const model = s.geminiModel || 'gemini-2.0-flash';
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const base = (s.geminiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(s.geminiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        temperature,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${truncate(body, 300)}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('');
  if (!content) throw new Error('Gemini 返回为空');
  return content;
}

// ---------- 练习生成 ----------

export function buildGeneratePrompt(chunkText, { level, count, customPrompt }) {
  const system =
    `You are an English vocabulary teacher for Chinese learners. ` +
    `From the given passage, pick the ${count} most valuable vocabulary words for a learner at ${level} level. ` +
    `Skip the most common basic words (the, and, said...) unless used in an idiomatic way. ` +
    `Use ONLY sentences that appear in the passage. ` +
    `For each word: give the original sentence, a cloze version with the word replaced by "____", ` +
    `its part of speech, a concise Chinese meaning, and 3 distractor choices that are the same part of speech ` +
    `and plausible but clearly wrong in context. ` +
    `Respond with ONLY a JSON object: {"words":[{"word","pos","meaning","sentence","cloze","distractors":[3 strings],"difficulty":1-5}]}` +
    (customPrompt ? `\nAdditional requirements: ${customPrompt}` : '');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Passage:\n\n${chunkText}` },
  ];
}

// 容错解析：剥 ```json 围栏、找首个 {
export function parseJSON(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI 返回中找不到 JSON');
  return JSON.parse(t.slice(start, end + 1));
}

export async function generateWords(chunkText, opts) {
  const messages = buildGeneratePrompt(chunkText, opts);
  let lastErr;
  let raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      raw = await chat(messages);
      const parsed = parseJSON(raw);
      const words = sanitizeWords(parsed.words || []);
      if (words.length) return words;
      lastErr = new Error('AI 返回里没有可用单词（字段缺失或挖空句格式不符）');
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
    }
    logWarn('ai', `生成解析失败(${attempt + 1}/2): ${lastErr.message} | 原始返回: ${truncate(raw, 600)}`);
  }
  throw new Error(`${lastErr.message} | 原始返回前 300 字: ${truncate(raw, 300)}`);
}

// 挖空句兼容 3 个及以上下划线 / 其他占位写法，统一归一成 ____
const BLANK_RE = /_{3,}/;

function sanitizeWords(words) {
  return words.filter(w =>
    w && typeof w.word === 'string' && w.word.trim() &&
    typeof w.cloze === 'string' && BLANK_RE.test(w.cloze)
  ).map(w => ({
    word: w.word.trim().toLowerCase(),
    pos: String(w.pos || '').trim(),
    meaning: String(w.meaning || '').trim(),
    sentence: String(w.sentence || '').trim(),
    cloze: w.cloze.replace(BLANK_RE, '____'),
    distractors: (Array.isArray(w.distractors) ? w.distractors : [])
      .slice(0, 3).map(d => String(d).trim()).filter(Boolean),
    difficulty: Math.min(5, Math.max(1, Number(w.difficulty) || 3)),
  }));
}

// ---------- 测试连接 ----------

export async function testConnection() {
  const raw = await chat(
    [{ role: 'user', content: 'Reply with exactly: {"ok":true}' }],
    { temperature: 0 }
  );
  const parsed = parseJSON(raw);
  if (parsed.ok !== true) throw new Error('连接成功但响应异常');
  return true;
}

// ---------- AI 批改填空 ----------

export async function aiGrade(input, answer, sentence) {
  const raw = await chat(
    [{
      role: 'user',
      content:
        `Fill-in-the-blank grading. The blank in the sentence should be filled with "${answer}". ` +
        `The student typed "${input}". Is the student's answer a correct inflection, ` +
        `spelling variant, or valid synonym of the answer in this context? ` +
        `Sentence: "${sentence}"\n` +
        `Respond ONLY with JSON: {"correct": true/false, "note": "one short sentence in Chinese"}`,
    }],
    { temperature: 0 }
  );
  return parseJSON(raw);
}

// ---------- 拉取模型列表 ----------

export async function fetchModels() {
  const s = getSettings();
  logInfo('models', `拉取模型列表 provider=${s.provider}`);
  try {
    const list = await fetchModelsInner(s);
    logInfo('models', `← OK ${list.length} 个模型`);
    return list;
  } catch (e) {
    logError('models', `✗ ${e.message || e}`);
    throw e;
  }
}

async function fetchModelsInner(s) {
  if (s.provider === 'gemini') {
    if (!s.geminiKey) throw new Error('未配置 Gemini 兼容 API Key');
    const base = (s.geminiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const res = await fetch(`${base}/models?pageSize=1000&key=${encodeURIComponent(s.geminiKey)}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`拉取失败 ${res.status}: ${truncate(body, 300)}`);
    }
    const data = await res.json();
    return (data.models || [])
      .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }
  // OpenAI 兼容
  if (!s.apiKey) throw new Error('未配置 API Key');
  const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/models`, {
    headers: { 'Authorization': `Bearer ${s.apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`拉取失败 ${res.status}: ${truncate(body, 300)}`);
  }
  const data = await res.json();
  return (data.data || []).map(m => m.id).filter(Boolean).sort();
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

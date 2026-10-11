// settings.js — BYOK 配置、测试连接、数据导出/导入
import { getSettings, saveSettings, exportAll, importAll, wipeAll } from './store.js';
import { testConnection, fetchModels } from './ai.js';
import { downloadBlob } from './wordbook.js';

function el(id) { return document.getElementById(id); }

export function initSettings() {
  // 载入当前配置
  const s = getSettings();
  el('set-provider').value = s.provider;
  el('set-baseurl').value = s.baseUrl;
  el('set-apikey').value = s.apiKey;
  el('set-model').value = s.model;
  el('set-gemini-baseurl').value = s.geminiBaseUrl;
  el('set-gemini-key').value = s.geminiKey;
  el('set-gemini-model').value = s.geminiModel;
  el('set-ai-grading').checked = s.aiGrading;
  el('set-custom-prompt').value = s.customPrompt;
  toggleProviderFields();

  el('set-provider').addEventListener('change', toggleProviderFields);

  el('fetch-models-openai').addEventListener('click', () => loadModels('openai'));
  el('fetch-models-gemini').addEventListener('click', () => loadModels('gemini'));

  el('set-test').addEventListener('click', async () => {
    saveForm(); // 先保存再测
    const out = el('set-test-result');
    out.textContent = '测试中…';
    try {
      await testConnection();
      out.textContent = '✓ 连接成功！';
    } catch (e) {
      out.textContent = '✗ ' + (e.message || e);
    }
  });

  el('set-save').addEventListener('click', () => {
    saveForm();
    el('set-save').textContent = '✓ 已保存';
    setTimeout(() => { el('set-save').textContent = '保存设置'; }, 1500);
  });

  el('set-export').addEventListener('click', () => {
    downloadBlob(JSON.stringify(exportAll(), null, 2),
      `word-novel-backup-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json');
  });

  el('set-import').addEventListener('click', () => el('import-file').click());
  el('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      importAll(payload);
      alert('导入成功，页面即将刷新');
      location.reload();
    } catch (err) {
      alert('导入失败：' + (err.message || err));
    }
    e.target.value = '';
  });

  el('set-wipe').addEventListener('click', () => {
    if (!confirm('确定清空所有数据吗？书籍、练习、生词本、设置都会删除，且无法恢复。')) return;
    if (!confirm('再次确认：真的要清空吗？建议先导出备份。')) return;
    wipeAll();
    location.reload();
  });
}

function saveForm() {
  saveSettings({
    provider: el('set-provider').value,
    baseUrl: el('set-baseurl').value.trim(),
    apiKey: el('set-apikey').value.trim(),
    model: el('set-model').value.trim(),
    geminiBaseUrl: el('set-gemini-baseurl').value.trim(),
    geminiKey: el('set-gemini-key').value.trim(),
    geminiModel: el('set-gemini-model').value.trim(),
    aiGrading: el('set-ai-grading').checked,
    customPrompt: el('set-custom-prompt').value.trim(),
  });
}

function toggleProviderFields() {
  const isGemini = el('set-provider').value === 'gemini';
  el('set-openai-fields').classList.toggle('hidden', isGemini);
  el('set-gemini-fields').classList.toggle('hidden', !isGemini);
}

// 拉取模型列表并渲染成点选芯片，点选后填入模型名输入框
async function loadModels(kind) {
  saveForm(); // 先保存，确保用刚填的 Key/Base URL
  const listId = kind === 'gemini' ? 'model-list-gemini' : 'model-list-openai';
  const btnId = kind === 'gemini' ? 'fetch-models-gemini' : 'fetch-models-openai';
  const inputId = kind === 'gemini' ? 'set-gemini-model' : 'set-model';
  const box = el(listId);
  const btn = el(btnId);
  btn.disabled = true;
  btn.textContent = '拉取中…';
  box.classList.remove('hidden');
  try {
    const models = await fetchModels();
    box.innerHTML = '';
    if (!models.length) {
      box.innerHTML = '<span class="ml-error">服务商返回了空列表</span>';
      return;
    }
    models.forEach(name => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'model-chip';
      chip.textContent = name;
      chip.addEventListener('click', () => {
        el(inputId).value = name;
      });
      box.appendChild(chip);
    });
  } catch (e) {
    box.innerHTML = `<span class="ml-error">${String(e.message || e)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 拉取模型列表';
  }
}

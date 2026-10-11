// settings.js — BYOK 配置、测试连接、数据导出/导入
import { getSettings, saveSettings, exportAll, importAll, wipeAll } from './store.js';
import { testConnection, fetchModels } from './ai.js';
import { downloadBlob } from './wordbook.js';
import { showToast } from './toast.js';

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
  initModelModal();

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

// 拉取模型列表：状态小字 + 成功后弹出选择弹窗
async function loadModels(kind) {
  saveForm(); // 先保存，确保用刚填的 Key/Base URL
  const btnId = kind === 'gemini' ? 'fetch-models-gemini' : 'fetch-models-openai';
  const inputId = kind === 'gemini' ? 'set-gemini-model' : 'set-model';
  const status = el('model-status');
  const btn = el(btnId);
  btn.disabled = true;
  status.textContent = '拉取中…';
  try {
    const models = await fetchModels();
    if (!models.length) {
      status.textContent = '✗ 拉取成功，但服务商返回了空列表';
      return;
    }
    status.textContent = `✓ 拉取成功，共 ${models.length} 个模型，点击选择`;
    openModelModal(models, inputId);
  } catch (e) {
    status.textContent = '✗ 拉取失败：' + String(e.message || e);
  } finally {
    btn.disabled = false;
  }
}

// ---- 模型选择弹窗 ----
let modalModels = [];
let modalTargetInput = null;

function openModelModal(models, inputId) {
  modalModels = models;
  modalTargetInput = inputId;
  el('model-filter').value = '';
  renderModelList('');
  el('model-modal').classList.remove('hidden');
}

function closeModelModal() {
  el('model-modal').classList.add('hidden');
}

function renderModelList(filter) {
  const box = el('model-modal-list');
  const q = filter.trim().toLowerCase();
  const list = q ? modalModels.filter(m => m.toLowerCase().includes(q)) : modalModels;
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="modal-empty muted">没有匹配的模型</div>';
    return;
  }
  list.forEach(name => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'modal-item';
    item.textContent = name;
    item.addEventListener('click', () => {
      el(modalTargetInput).value = name;
      closeModelModal();
    });
    box.appendChild(item);
  });
}

function initModelModal() {
  el('model-modal-close').addEventListener('click', closeModelModal);
  el('model-modal').addEventListener('click', (e) => {
    if (e.target === el('model-modal')) closeModelModal(); // 点遮罩关闭
  });
  el('model-filter').addEventListener('input', (e) => renderModelList(e.target.value));
}

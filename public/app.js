const sampleTranscript = `项目组周会，时间为 2026 年 6 月 19 日。参会人包括张敏、李哲、王一凡和陈可。
张敏说明本周完成了登录页改版，下一步要补充移动端适配。李哲反馈语音转文字接口已经跑通，但长音频需要分段上传。
王一凡提出演示文稿还缺少技术路线图和测试截图，建议周日前补齐。陈可提醒访问密钥不能放在前端，需要通过后端代理调用模型。
会议决定本周先完成会议纪要助手的可演示版本，支持粘贴会议文本、生成结构化纪要、追问会议细节、导出 Markdown 和保存历史记录。
待办事项：张敏负责完善页面交互，截止周六；李哲负责接口联调，截止周日；王一凡负责整理课程汇报材料，截止下周一。`;

const fallbackMinutes = {
  participants: ["张敏", "李哲", "王一凡", "陈可"],
  agenda: ["项目进度同步", "语音转文字能力", "演示材料准备", "模型安全接入"],
  discussionPoints: [
    "首版需要覆盖会议文本输入、结构化纪要生成、AI 追问、历史保存和导出。",
    "语音识别优先走浏览器 Web Speech，上传音频保留后端转写扩展点。",
    "访问密钥只保存在本地服务端配置，浏览器端不直接调用模型。",
    "页面需要具备课程答辩可展示的完整操作闭环。"
  ],
  decisions: [
    "选择会议纪要助手作为课程场景。",
    "使用 Prompt + 模型服务 + 本地历史记录实现可演示版本。",
    "优先接入阿里云百炼千问模型服务。"
  ],
  risks: [
    "长文本生成可能耗时较长，需要提供明确加载状态。",
    "浏览器实时语音识别存在兼容性差异，需要允许手动粘贴文本兜底。",
    "模型输出可能不是严格 JSON，后端需要做容错解析。"
  ],
  actionItems: [
    { id: "demo-1", content: "完善会议纪要助手页面交互", owner: "张敏", dueDate: "周六", priority: "高", status: "进行中" },
    { id: "demo-2", content: "完成语音转文字与 LLM 接口联调", owner: "李哲", dueDate: "周日", priority: "高", status: "未开始" },
    { id: "demo-3", content: "整理课程汇报材料和测试截图", owner: "王一凡", dueDate: "下周一", priority: "中", status: "未开始" }
  ],
  summary: "本次会议确认以 AI 会议纪要助手作为课程项目，首版聚焦文本录入、结构化纪要、待办提取、AI 追问、历史记录和模型服务接入。"
};

const state = {
  minutes: fallbackMinutes,
  meetings: [],
  provider: null,
  speechRecognition: null,
  mediaRecorder: null,
  chunks: [],
  recording: false,
  transcriptDraft: sampleTranscript,
  smartSummaryDraft: "",
  history: [sampleTranscript],
  historyIndex: 0,
  minutesVersions: [],
  currentMeetingId: null,
  currentMeetingTime: new Date().toISOString(),
  saving: false,
  generationAbort: null,
  transcriptionAbort: null,
  transcribing: false,
  lastAudioFile: null,
  lastTranscriptionFailed: false,
  assistantHistory: [],
  modalResolve: null,
  activeView: "record",
  activeDoc: "minutes",
  preferences: {
    language: localStorage.getItem("mma-language") || "zh-CN",
    tone: localStorage.getItem("mma-tone") || "teal",
    density: localStorage.getItem("mma-density") || "comfortable"
  }
};

const $ = (id) => document.getElementById(id);
const qs = (selector) => document.querySelector(selector);

const i18n = {
  "zh-CN": {
    ready: "已就绪",
    modelReady: "模型已就绪",
    modelPending: "待配置模型",
    demoMode: "演示模式",
    modelConfigured: "模型已配置",
    pendingConfig: "待配置",
    navRecord: "记录",
    navMinutes: "纪要",
    navTasks: "待办",
    navHistory: "历史",
    navAssistant: "助手",
    navSettings: "设置",
    share: "复制纪要",
    export: "导出",
    saveMeeting: "保存会议",
    generate: "生成纪要",
    generateBusy: "生成中...",
    generatingStatus: "正在生成",
    generatingMinutes: "正在生成纪要",
    generatingMinutesDesc: "正在梳理参会人、决策结论和待办事项，请稍等片刻。",
    thinking: "正在思考",
    needTranscript: "请先输入会议文本",
    generatedApi: "已完成模型生成",
    generatedDemo: "已使用演示模式生成纪要",
    sourceEyebrow: "输入来源",
    sourceTitle: "会议材料",
    sourceModeText: "文本输入",
    upload: "上传音频/视频",
    sample: "导入示例",
    record: "开始录音",
    clear: "清空",
    recordIdle: "待录入",
    recordHelp: "支持粘贴文本、浏览器语音识别、上传文件转写",
    cancel: "取消",
    rawTranscript: "原始转写",
    smartSummary: "智能摘要",
    searchPlaceholder: "搜索转写内容",
    locate: "定位",
    transcriptPlaceholder: "在这里粘贴会议转写，或点击录音/上传开始采集会议内容...",
    recentMeetings: "最近会议",
    docMinutes: "结构化纪要",
    docRaw: "原始文本",
    docTasks: "待办视图",
    addTask: "新增待办",
    copyMinutes: "复制纪要",
    optimize: "AI 优化",
    assistantEyebrow: "AI Copilot",
    assistantTitle: "会议助手",
    assistantGreeting: "我会基于当前会议原文回答问题、生成引用依据、改写纪要，也可以把结论转成周报、邮件或任务清单。",
    qDecision: "关键决策",
    qOwner: "负责人待办",
    qRisk: "风险排查",
    qWeekly: "生成周报",
    questionPlaceholder: "继续追问会议细节或输入指令...",
    send: "发送",
    captureTitle: "开始一场会议记录",
    captureDesc: "左侧录入会议内容后，点击生成纪要。你可以先导入示例，也可以粘贴自己的会议转写。",
    captureStatusReady: "就绪",
    captureStatusEmpty: "待录入",
    captureStatusLabel: "记录状态",
    recommendedFlow: "推荐流程",
    flow1: "粘贴会议文本，或点击开始录音。",
    flow2: "确认原始内容完整后生成纪要。",
    flow3: "在待办页补充负责人和截止时间。",
    currentMeeting: "当前会议",
    historyTitle: "历史纪要",
    historyDesc: "管理已保存的会议纪要，可以打开继续编辑，也可以删除不需要的记录。",
    noHistory: "暂无历史会议",
    noHistoryDesc: "点击顶部“保存会议”后，会在这里沉淀可复用记录。",
    open: "打开",
    delete: "删除",
    settingsTitle: "设置",
    settingsDesc: "集中管理模型、语言、界面色调和默认工作方式。",
    modelConfig: "模型配置",
    modelConfigDesc: "用于纪要生成、追问和音频转写。",
    modelEndpoint: "千问 API 基础地址",
    minutesModel: "AI 文本模型",
    transcribeEndpoint: "千问 API 基础地址",
    transcribeModel: "语音识别模型",
    accessKey: "千问 API Key",
    keepKey: "留空则保持已保存密钥",
    useDemo: "使用演示模式",
    preferences: "偏好设置",
    preferencesDesc: "这些设置会立即应用在当前浏览器。",
    language: "界面语言",
    tone: "场景色调",
    density: "页面密度",
    zh: "简体中文",
    en: "English",
    teal: "青绿色",
    blueTone: "商务蓝",
    greenTone: "清新绿",
    slate: "深灰",
    comfortable: "舒适",
    compact: "紧凑",
    preset: "填入推荐模型",
    saveSettings: "保存设置",
    footerRecord: "记录页",
    wordCount: "字数"
  },
  "en-US": {
    ready: "Ready",
    modelReady: "Model ready",
    modelPending: "Model setup needed",
    demoMode: "Demo mode",
    modelConfigured: "Model configured",
    pendingConfig: "Not configured",
    navRecord: "Record",
    navMinutes: "Minutes",
    navTasks: "Tasks",
    navHistory: "History",
    navAssistant: "Assistant",
    navSettings: "Settings",
    share: "Copy minutes",
    export: "Export",
    saveMeeting: "Save",
    generate: "Generate",
    generateBusy: "Generating...",
    generatingStatus: "Generating",
    generatingMinutes: "Generating minutes",
    generatingMinutesDesc: "Extracting participants, decisions, and action items. This usually takes a moment.",
    thinking: "Thinking",
    needTranscript: "Please add meeting text first",
    generatedApi: "Generated with the configured model",
    generatedDemo: "Generated in demo mode",
    sourceEyebrow: "Input",
    sourceTitle: "Meeting Source",
    sourceModeText: "Text input",
    upload: "Upload audio/video",
    sample: "Load sample",
    record: "Start recording",
    clear: "Clear",
    recordIdle: "Waiting",
    recordHelp: "Paste text, use browser speech recognition, or upload a file",
    cancel: "Cancel",
    rawTranscript: "Transcript",
    smartSummary: "Summary",
    searchPlaceholder: "Search transcript",
    locate: "Find",
    transcriptPlaceholder: "Paste a meeting transcript here, or record/upload audio to start...",
    recentMeetings: "Recent meetings",
    docMinutes: "Structured minutes",
    docRaw: "Raw text",
    docTasks: "Tasks",
    addTask: "Add task",
    copyMinutes: "Copy",
    optimize: "AI polish",
    assistantEyebrow: "AI Copilot",
    assistantTitle: "Assistant",
    assistantGreeting: "Ask about the current transcript, rewrite the minutes, cite details, or turn conclusions into a report, email, or task list.",
    qDecision: "Decisions",
    qOwner: "By owner",
    qRisk: "Risks",
    qWeekly: "Weekly report",
    questionPlaceholder: "Ask a follow-up or enter an instruction...",
    send: "Send",
    captureTitle: "Start recording a meeting",
    captureDesc: "Add meeting content on the left, then generate minutes. You can load the sample or paste your own transcript.",
    captureStatusReady: "Ready",
    captureStatusEmpty: "Empty",
    captureStatusLabel: "Record status",
    recommendedFlow: "Recommended flow",
    flow1: "Paste meeting text or start recording.",
    flow2: "Review the transcript, then generate minutes.",
    flow3: "Add owners and due dates on the Tasks page.",
    currentMeeting: "Current meeting",
    historyTitle: "Saved minutes",
    historyDesc: "Open saved meetings to continue editing, or delete records you no longer need.",
    noHistory: "No saved meetings",
    noHistoryDesc: "Use Save after generating minutes to keep a reusable record here.",
    open: "Open",
    delete: "Delete",
    settingsTitle: "Settings",
    settingsDesc: "Manage models, language, theme, and default workspace behavior.",
    modelConfig: "Model",
    modelConfigDesc: "Used for minutes generation, follow-up questions, and transcription.",
    modelEndpoint: "Qwen API base URL",
    minutesModel: "AI text model",
    transcribeEndpoint: "Qwen API base URL",
    transcribeModel: "ASR model",
    accessKey: "Qwen API key",
    keepKey: "Leave blank to keep the saved key",
    useDemo: "Use demo mode",
    preferences: "Preferences",
    preferencesDesc: "These settings apply immediately in this browser.",
    language: "Interface language",
    tone: "Theme color",
    density: "Page density",
    zh: "Simplified Chinese",
    en: "English",
    teal: "Teal",
    blueTone: "Business blue",
    greenTone: "Fresh green",
    slate: "Slate",
    comfortable: "Comfortable",
    compact: "Compact",
    preset: "Use recommended model",
    saveSettings: "Save settings",
    footerRecord: "Record page",
    wordCount: "Words"
  }
};

function t(key) {
  return i18n[state.preferences.language]?.[key] || i18n["zh-CN"][key] || key;
}

function toast(message, tone = "info") {
  const node = $("toast");
  node.textContent = message;
  node.dataset.tone = tone;
  node.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.classList.remove("show"), 3000);
}

function openModal({ title, description = "", inputValue = "", confirmText = "确定", cancelText = "取消", extraText = "", danger = false, prompt = false }) {
  closeModal(false);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <section class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h2 id="modalTitle">${escapeHtml(title)}</h2>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      ${prompt ? `<input id="modalInput" value="${escapeAttr(inputValue)}" />` : ""}
      <div class="modal-actions">
        <button class="secondary" type="button" data-modal-cancel>${escapeHtml(cancelText)}</button>
        ${extraText ? `<button class="secondary" type="button" data-modal-extra>${escapeHtml(extraText)}</button>` : ""}
        <button class="${danger ? "primary danger-button" : "primary"}" type="button" data-modal-confirm>${escapeHtml(confirmText)}</button>
      </div>
    </section>
  `;
  document.body.appendChild(backdrop);
  const input = $("modalInput");
  setTimeout(() => (input || backdrop.querySelector("[data-modal-confirm]"))?.focus(), 0);
  return new Promise((resolve) => {
    state.modalResolve = resolve;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-modal-cancel]")) closeModal(false);
      if (event.target.closest("[data-modal-extra]")) closeModal("extra");
      if (event.target.closest("[data-modal-confirm]")) closeModal(prompt ? input.value : true);
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal(false);
      if (event.key === "Enter" && prompt) closeModal(input.value);
    });
  });
}

function closeModal(value) {
  const backdrop = document.querySelector(".modal-backdrop");
  if (backdrop) backdrop.remove();
  if (state.modalResolve) {
    const resolve = state.modalResolve;
    state.modalResolve = null;
    resolve(value);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("\n", " ");
}

function getTranscript() {
  return $("transcriptInput").value.trim();
}

function setTranscript(value, push = true) {
  $("transcriptInput").value = value;
  state.transcriptDraft = value;
  updateWordCount();
  if (push) pushHistory(value);
}

function setTranscriptionUi(status, { active = false, failed = false } = {}) {
  const uploadInput = $("audioFile");
  const uploadButton = qs(".upload-button");
  const actionButton = $("cancelRecordBtn");
  $("recordState").textContent = status;
  qs(".record-card")?.toggleAttribute("data-active", active);
  if (uploadInput) uploadInput.disabled = Boolean(active);
  uploadButton?.toggleAttribute("aria-disabled", Boolean(active));
  if (actionButton) {
    actionButton.textContent = active ? "取消识别" : failed ? "重新识别" : t("cancel");
  }
}

function pushHistory(value) {
  if (!value || state.history[state.historyIndex] === value) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(value);
  state.historyIndex = state.history.length - 1;
}

function setBusy(button, label) {
  button.dataset.defaultText ||= button.textContent;
  button.disabled = true;
  button.textContent = label;
}

function clearBusy(button) {
  button.disabled = false;
  button.textContent = button.dataset.defaultText;
}

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatMeetingDate(value = state.currentMeetingTime, withTime = true) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  });
}

function defaultMeetingTitle() {
  return `新会议 · ${formatMeetingDate(state.currentMeetingTime)}`;
}

function setDocumentStatus(status, detail = "") {
  const node = $("saveState");
  if (!node) return;
  const labels = {
    unsaved: "未保存",
    dirty: "有未保存修改",
    saving: "保存中",
    saved: `已保存 ${detail || nowLabel()}`,
    error: "保存失败"
  };
  node.textContent = labels[status] || status;
  node.dataset.state = status;
}

function updateWordCount() {
  const text = getTranscript();
  $("wordCount").textContent = `${t("wordCount")} ${text.replace(/\s/g, "").length}`;
}

function updateMetrics() {
  const minutes = state.minutes || fallbackMinutes;
  $("taskMetric").textContent = minutes.actionItems?.length || 0;
  $("riskMetric").textContent = minutes.risks?.length || 0;
  $("decisionMetric").textContent = minutes.decisions?.length || 0;
}

function renderList(title, items = [], className = "badge-list", field = "") {
  return `
    <section class="doc-section" ${field ? `data-section-field="${field}"` : ""}>
      <div class="section-title"><span>${title}</span><small>${items.length}</small></div>
      <ul class="${className}">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>待确认</li>"}
      </ul>
      ${field ? `<div class="section-actions">
        <button class="ghost" type="button" data-add-list-item="${field}">新增</button>
        <button class="ghost" type="button" data-remove-list-item="${field}">删除末项</button>
      </div>` : ""}
    </section>
  `;
}

function renderEditableList(title, field, items = [], className = "badge-list") {
  const rows = items.length ? items : ["待确认"];
  return `
    <section class="doc-section" data-section-field="${field}">
      <div class="section-title"><span>${title}</span><small>${items.length}</small></div>
      <ul class="${className}">
        ${rows.map((item, index) => `
          <li contenteditable="true" data-list-field="${field}" data-list-index="${index}">${escapeHtml(item)}</li>
        `).join("")}
      </ul>
      <div class="section-actions">
        <button class="ghost" type="button" data-add-list-item="${field}">新增</button>
        <button class="ghost" type="button" data-remove-list-item="${field}">删除末项</button>
      </div>
    </section>
  `;
}

function getMinutesCheckIssues(minutes = state.minutes || fallbackMinutes) {
  const tasks = minutes.actionItems || [];
  const issues = [];
  if (!(minutes.participants || []).length) issues.push("缺少参会人");
  if (tasks.some((item) => !item.owner || item.owner.includes("待确认"))) issues.push("待办缺少负责人");
  if (tasks.some((item) => !item.dueDate || item.dueDate.includes("待确认"))) issues.push("待办缺少截止日期");
  if ((minutes.decisions || []).some((item) => item.length < 8 || item.includes("待确认"))) issues.push("决策结果不够明确");
  if ((minutes.summary || "").includes("待确认")) issues.push("存在待确认信息");
  return issues;
}

function renderMinutesCheck(minutes) {
  const issues = getMinutesCheckIssues(minutes);
  return `
    <div class="doc-check ${issues.length ? "needs-review" : "passed"}">
      <strong>${issues.length ? issues.length : "OK"}</strong>
      <span>${issues.length ? "纪要检查" : "检查通过"}</span>
      ${issues.length ? `<small>${issues.map(escapeHtml).join(" / ")}</small>` : "<small>参会人、待办和决策信息较完整</small>"}
    </div>
  `;
}

function refreshMinutesCheck() {
  const old = $("minutesDoc")?.querySelector(".doc-check");
  if (old) old.outerHTML = renderMinutesCheck(state.minutes);
}

function renderTask(item, index) {
  return `
    <div class="task-row" data-task-index="${index}">
      <input data-field="content" value="${escapeAttr(item.content || "待确认")}" />
      <input data-field="owner" value="${escapeAttr(item.owner || "待确认")}" />
      <input data-field="dueDate" value="${escapeAttr(item.dueDate || "待确认")}" />
      <select data-field="priority">
        ${["高", "中", "低"].map((priority) => `<option ${item.priority === priority ? "selected" : ""}>${priority}</option>`).join("")}
      </select>
      <select data-field="status">
        ${["未开始", "进行中", "已完成"].map((status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
      </select>
      <button class="ghost danger task-delete" type="button" data-delete-task="${index}">删除</button>
    </div>
  `;
}

function renderTaskTable(items = []) {
  return `
    <section class="doc-section task-section">
      <div class="section-title"><span>待办事项</span><small>${items.length}</small></div>
      <div class="task-table">
        <div class="task-row table-head"><span>事项</span><span>负责人</span><span>截止时间</span><span>优先级</span><span>状态</span></div>
        ${items.map(renderTask).join("") || '<div class="task-row"><span>待确认</span><span>待确认</span><span>待确认</span><span>中</span><span>未开始</span></div>'}
      </div>
    </section>
  `;
}

function renderMinutes(minutes = fallbackMinutes) {
  state.minutes = {
    participants: [],
    agenda: [],
    discussionPoints: [],
    decisions: [],
    risks: [],
    actionItems: [],
    summary: "",
    ...minutes
  };
  state.activeDoc = "minutes";
  setDocTab("minutes");

  const m = state.minutes;
  $("minutesDoc").innerHTML = `
    <header class="doc-hero">
      <div>
        <h1>${escapeHtml($("meetingTitle").textContent || "会议纪要")}</h1>
        <p>${formatMeetingDate(state.currentMeetingTime)} · 自动结构化 · 可编辑待办</p>
      </div>
      <div class="doc-score"><strong>${Math.min(99, 70 + (m.actionItems?.length || 0) * 5)}</strong><span>完整度评分</span></div>
    </header>

    <section class="summary-card">${escapeHtml(m.summary || "点击生成纪要后，AI 会在这里给出本次会议的核心摘要。")}</section>

    <div class="insight-grid">
      <div class="insight-card"><strong>${m.participants?.length || 0}</strong><span>参会人</span></div>
      <div class="insight-card"><strong>${m.decisions?.length || 0}</strong><span>决策结论</span></div>
      <div class="insight-card"><strong>${m.actionItems?.length || 0}</strong><span>待办任务</span></div>
    </div>

    ${renderList("参会人", m.participants, "people-list")}
    ${renderList("议题", m.agenda, "clean-list")}
    ${renderList("讨论要点", m.discussionPoints, "badge-list")}
    ${renderList("决策结论", m.decisions, "decision-list")}
    ${renderList("风险提示", m.risks, "risk-list")}
    ${renderTaskTable(m.actionItems)}
  `;

  enhanceMinutesDocument();
  document.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", updateTaskFromInput));
  updateMetrics();
  $("lastUpdated").textContent = `最后更新：${nowLabel()}`;
}

function enhanceMinutesDocument() {
  const doc = $("minutesDoc");
  if (!doc || state.activeDoc !== "minutes") return;

  const oldScore = doc.querySelector(".doc-score");
  if (oldScore) oldScore.outerHTML = renderMinutesCheck(state.minutes);

  const summary = doc.querySelector(".summary-card");
  if (summary) {
    summary.contentEditable = "true";
    summary.dataset.summaryField = "summary";
    summary.setAttribute("aria-label", "编辑会议摘要");
  }

  const fields = ["participants", "agenda", "discussionPoints", "decisions", "risks"];
  doc.querySelectorAll(".doc-section").forEach((section, sectionIndex) => {
    const field = fields[sectionIndex];
    if (!field) return;
    section.dataset.sectionField = field;
    section.querySelectorAll("li").forEach((item, itemIndex) => {
      item.contentEditable = "true";
      item.dataset.listField = field;
      item.dataset.listIndex = String(itemIndex);
    });
    if (!section.querySelector(".section-actions")) {
      section.insertAdjacentHTML("beforeend", `
        <div class="section-actions">
          <button class="ghost" type="button" data-add-list-item="${field}">新增</button>
          <button class="ghost" type="button" data-remove-list-item="${field}">删除末项</button>
        </div>
      `);
    }
  });

  wireEditableMinutes();
}

function wireEditableMinutes() {
  document.querySelectorAll("[data-summary-field]").forEach((node) => {
    node.addEventListener("blur", () => {
      state.minutes.summary = node.textContent.trim();
      markDirty();
    });
  });

  document.querySelectorAll("[data-list-field]").forEach((node) => {
    node.addEventListener("blur", () => {
      const field = node.dataset.listField;
      const index = Number(node.dataset.listIndex);
      state.minutes[field] ||= [];
      state.minutes[field][index] = node.textContent.trim() || "待确认";
      markDirty();
      updateMetrics();
      refreshMinutesCheck();
    });
  });

  document.querySelectorAll("[data-add-list-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.addListItem;
      state.minutes[field] ||= [];
      state.minutes[field].push("待确认");
      renderMinutes(state.minutes);
      markDirty();
    });
  });

  document.querySelectorAll("[data-remove-list-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.removeListItem;
      state.minutes[field] ||= [];
      state.minutes[field].pop();
      renderMinutes(state.minutes);
      markDirty();
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () => deleteTask(Number(button.dataset.deleteTask)));
  });
}

function renderRawDocument() {
  state.activeDoc = "raw";
  setDocTab("raw");
  const paragraphs = getTranscript().split(/\n+/).filter(Boolean);
  $("minutesDoc").innerHTML = `
    <header class="doc-hero">
      <div>
        <h1>原始会议文本</h1>
        <p>可用于核对引用、检查转写质量和补充遗漏上下文</p>
      </div>
      <div class="doc-score"><strong>${paragraphs.length}</strong><span>段落</span></div>
    </header>
    <section class="raw-transcript-doc">
      ${paragraphs.map((p, index) => `<p><strong>${String(index + 1).padStart(2, "0")}</strong><span>${escapeHtml(p)}</span></p>`).join("") || "<p><strong>01</strong><span>暂无原始文本</span></p>"}
    </section>
  `;
}

function renderTasksDocument() {
  state.activeDoc = "tasks";
  setDocTab("tasks");
  const items = state.minutes?.actionItems || [];
  $("minutesDoc").innerHTML = `
    <header class="doc-hero">
      <div>
        <h1>待办任务看板</h1>
        <p>直接编辑负责人、截止时间、优先级和状态，适合会后跟进</p>
      </div>
      <div class="doc-score"><strong>${items.filter((item) => item.status !== "已完成").length}</strong><span>未完成</span></div>
    </header>
    ${renderTaskTable(items)}
    <section class="doc-section">
      <div class="section-title"><span>执行建议</span><small>AI</small></div>
      <ul class="badge-list">
        <li>把高优任务放到下一次站会第一项同步。</li>
        <li>对截止时间为“待确认”的任务补充日期，避免会后责任不清。</li>
        <li>导出 Markdown 后可直接发送到群或项目管理工具。</li>
      </ul>
    </section>
  `;
  document.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", updateTaskFromInput));
  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () => deleteTask(Number(button.dataset.deleteTask)));
  });
}

function renderUtilityDocument(title, subtitle, bodyHtml) {
  $("minutesDoc").innerHTML = `
    <header class="doc-hero">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
    </header>
    <section class="utility-grid">${bodyHtml}</section>
  `;
}

function renderCaptureHome() {
  $("minutesDoc").innerHTML = `
    <header class="doc-hero capture-hero">
      <div>
        <h1>${t("captureTitle")}</h1>
        <p>${t("captureDesc")}</p>
      </div>
      <div class="doc-score"><strong>${getTranscript() ? t("captureStatusReady") : t("captureStatusEmpty")}</strong><span>${t("captureStatusLabel")}</span></div>
    </header>
    <section class="capture-layout">
      <div class="capture-card">
        <strong>${t("recommendedFlow")}</strong>
        <ol>
          <li>${t("flow1")}</li>
          <li>${t("flow2")}</li>
          <li>${t("flow3")}</li>
        </ol>
      </div>
      <div class="capture-card">
        <strong>${t("currentMeeting")}</strong>
        <p>${escapeHtml((getTranscript() || sampleTranscript).slice(0, 180))}${(getTranscript() || sampleTranscript).length > 180 ? "..." : ""}</p>
        <button class="secondary" type="button" id="captureGenerateBtn">${t("generate")}</button>
      </div>
    </section>
  `;
  $("captureGenerateBtn")?.addEventListener("click", generateMinutes);
  $("lastUpdated").textContent = t("footerRecord");
}

function updateTaskFromInput(event) {
  const row = event.target.closest("[data-task-index]");
  if (!row || !state.minutes) return;
  const index = Number(row.dataset.taskIndex);
  const field = event.target.dataset.field;
  state.minutes.actionItems[index][field] = event.target.value;
  updateMetrics();
  markDirty();
  refreshMinutesCheck();
  toast("待办已更新");
}

function addTask() {
  state.minutes ||= structuredClone(fallbackMinutes);
  state.minutes.actionItems ||= [];
  state.minutes.actionItems.push({
    id: crypto.randomUUID(),
    content: "新增待办事项",
    owner: "待确认",
    dueDate: "待确认",
    priority: "中",
    status: "未开始"
  });
  state.activeDoc === "tasks" ? renderTasksDocument() : renderMinutes(state.minutes);
  toast("已新增一条待办");
}

function deleteTask(index) {
  if (!state.minutes?.actionItems?.[index]) return;
  state.minutes.actionItems.splice(index, 1);
  state.activeDoc === "tasks" ? renderTasksDocument() : renderMinutes(state.minutes);
  markDirty();
  toast("待办已删除");
}

function markDirty() {
  setDocumentStatus("dirty");
}

function createEmptyMinutes() {
  return {
    participants: [],
    agenda: [],
    discussionPoints: [],
    decisions: [],
    risks: [],
    actionItems: [],
    summary: ""
  };
}

function startNewMeeting(showToast = true) {
  document.body.classList.remove("more-open");
  state.currentMeetingId = null;
  state.currentMeetingTime = new Date().toISOString();
  state.minutes = createEmptyMinutes();
  state.transcriptDraft = "";
  state.smartSummaryDraft = "";
  state.history = [""];
  state.historyIndex = 0;
  $("meetingTitle").textContent = defaultMeetingTitle();
  $("transcriptInput").value = "";
  $("chatLog").innerHTML = "";
  addChat("assistant", "已新建会议。先粘贴原文、录音或上传材料，再生成纪要。");
  renderCaptureHome();
  updateMetrics();
  updateWordCount();
  setDocumentStatus("unsaved");
  activateView("record");
  updateTopActions();
  if (showToast) toast("已新建会议，不会覆盖上一场会议");
}

function renderMeetings() {
  $("meetingCount").textContent = state.meetings.length;
  $("meetingList").innerHTML = state.meetings.map((meeting) => `
    <div class="meeting-item" data-id="${meeting.id}">
      <button class="meeting-open-mini" type="button" data-id="${meeting.id}">
        <strong>${escapeHtml(meeting.title)}</strong>
        <span>${formatMeetingDate(meeting.meetingTime || meeting.createdAt)}</span>
      </button>
      <button class="meeting-delete-mini" type="button" data-id="${meeting.id}" title="删除记录">删除</button>
    </div>
  `).join("") || '<div class="meeting-item"><strong>暂无历史会议</strong><span>保存后会出现在这里</span></div>';

  document.querySelectorAll(".meeting-open-mini").forEach((button) => {
    button.addEventListener("click", () => openMeeting(button.dataset.id));
  });
  document.querySelectorAll(".meeting-delete-mini").forEach((button) => {
    button.addEventListener("click", () => deleteMeeting(button.dataset.id));
  });
}

function openMeeting(id) {
  const meeting = state.meetings.find((item) => item.id === id);
  if (!meeting) return;
  state.currentMeetingId = meeting.id;
  state.currentMeetingTime = meeting.meetingTime || meeting.createdAt || new Date().toISOString();
  $("meetingTitle").textContent = meeting.title;
  setTranscript(meeting.transcript);
  renderMinutes(meeting.minutes);
  activateView("minutes");
  setDocumentStatus("saved", nowLabel());
  toast("已打开历史会议");
}

async function deleteMeeting(id) {
  const meeting = state.meetings.find((item) => item.id === id);
  if (!meeting) return;
  const ok = await openModal({
    title: "删除会议",
    description: `确定删除“${meeting.title}”吗？此操作不可撤销。`,
    confirmText: "删除",
    danger: true
  });
  if (!ok) return;
  try {
    await api(`/api/meetings/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.meetings = state.meetings.filter((item) => item.id !== id);
    if (state.currentMeetingId === id) state.currentMeetingId = null;
    renderMeetings();
    if (state.activeView === "history") renderHistoryView();
    toast("历史纪要已删除");
  } catch (error) {
    const pill = $("providerStatus");
    if (pill) {
      pill.textContent = "配置错误";
      pill.dataset.state = "error";
    }
    toast(error.message, "error");
  }
}

function addChat(role, text, citations = []) {
  const node = document.createElement("div");
  node.className = `chat-message ${role}`;
  const citationHtml = citations.length ? `<small>${citations.map(escapeHtml).join("<br />")}</small>` : "";
  node.innerHTML = `<p>${escapeHtml(text)}</p>${citationHtml}`;
  $("chatLog").appendChild(node);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}

function showAssistantThinking() {
  const log = $("chatLog");
  if (!log) return null;
  const node = document.createElement("div");
  node.className = "chat-message assistant thinking-message";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.innerHTML = `
    <span class="thinking-label">${t("thinking")}</span>
    <span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>
  `;
  log.appendChild(node);
  log.scrollTop = log.scrollHeight;
  return node;
}

function showMinutesGenerating() {
  const doc = $("minutesDoc");
  if (!doc) return;
  doc.innerHTML = `
    <section class="generation-state" role="status" aria-live="polite">
      <div class="generation-head">
        <span class="generation-spinner" aria-hidden="true"></span>
        <div>
          <h1>${t("generatingMinutes")}</h1>
          <p>${t("generatingMinutesDesc")}</p>
        </div>
      </div>
      <div class="generation-lines" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="generation-mini-grid" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <button id="cancelGenerationBtn" class="secondary" type="button">取消生成</button>
    </section>
  `;
  $("cancelGenerationBtn")?.addEventListener("click", cancelGeneration);
  $("lastUpdated").textContent = t("generatingStatus");
}

function updateProviderStatus(provider) {
  state.provider = provider;
  const pill = $("providerStatus");
  if (provider.demoMode) {
    pill.textContent = t("demoMode");
    pill.dataset.state = "demo";
  } else if (provider.hasApiKey) {
    pill.textContent = t("modelConfigured");
    pill.dataset.state = "ready";
  } else {
    pill.textContent = t("pendingConfig");
    pill.dataset.state = "missing";
  }
}

function cancelGeneration() {
  if (!state.generationAbort) return;
  state.generationAbort.abort();
  state.generationAbort = null;
  toast("已取消生成");
}

async function loadProvider() {
  const provider = await api("/api/settings/provider");
  $("chatEndpointInput").value = provider.chatEndpoint || "";
  $("chatModelInput").value = provider.chatModel || "";
  $("transcribeEndpointInput").value = "";
  $("transcribeModelInput").value = provider.transcribeModel || "";
  $("demoModeInput").checked = Boolean(provider.demoMode);
  updateProviderStatus(provider);
  syncSettingsPage(provider);
}

async function ensureGenerationReady() {
  if (state.provider?.demoMode || state.provider?.hasApiKey) return true;
  const useDemo = await openModal({
    title: "开始前选择一种方式",
    description: "当前还没有配置模型。你可以先用演示数据体验完整流程，或进入设置填写自己的模型。",
    confirmText: "使用演示数据",
    cancelText: "配置模型"
  });
  if (useDemo) {
    $("demoModeInput").checked = true;
    const provider = await api("/api/settings/provider", {
      method: "PUT",
      body: JSON.stringify({
        chatEndpoint: $("chatEndpointInput").value.trim(),
        transcribeEndpoint: "",
        chatModel: $("chatModelInput").value.trim(),
        transcribeModel: $("transcribeModelInput").value.trim(),
        apiKey: "",
        demoMode: true
      })
    });
    updateProviderStatus(provider);
    toast("已开启演示模式");
    return true;
  }
  activateView("settings");
  return false;
}

async function loadMeetings() {
  const data = await api("/api/meetings");
  state.meetings = data.meetings || [];
  renderMeetings();
  if (state.meetings[0]) {
    state.currentMeetingId = state.meetings[0].id;
    state.currentMeetingTime = state.meetings[0].meetingTime || state.meetings[0].createdAt || new Date().toISOString();
    $("meetingTitle").textContent = state.meetings[0].title;
    setTranscript(state.meetings[0].transcript, false);
    renderMinutes(state.meetings[0].minutes);
    setDocumentStatus("saved", nowLabel());
  } else {
    startNewMeeting(false);
  }
}

async function generateMinutes() {
  const transcript = getTranscript();
  if (!transcript) return toast(t("needTranscript"), "error");
  if (!(await ensureGenerationReady())) return;
  if (state.minutes?.summary || state.minutes?.actionItems?.length) {
    const ok = await openModal({
      title: "重新生成纪要",
      description: "重新生成会覆盖当前摘要、决策、风险和待办。已保存的历史记录不受影响，未保存修改建议先保存。",
      confirmText: "覆盖并重新生成",
      cancelText: "取消"
    });
    if (!ok) return;
    state.minutesVersions.push(structuredClone(state.minutes));
  }
  const button = $("generateBtn");
  state.generationAbort = new AbortController();
  setBusy(button, t("generateBusy"));
  $("recordState").textContent = t("generatingMinutes");
  qs(".record-card")?.setAttribute("data-active", "true");
  showMinutesGenerating();
  try {
    const result = await api("/api/minutes/generate", {
      method: "POST",
      signal: state.generationAbort.signal,
      body: JSON.stringify({ transcript })
    });
    renderMinutes(result.minutes);
    markDirty();
    if (state.activeView === "record") activateView("minutes");
    toast(result.source === "api" ? t("generatedApi") : t("generatedDemo"));
  } catch (error) {
    if (error.name === "AbortError") {
      renderCaptureHome();
      return;
    }
    toast(error.message, "error");
  } finally {
    clearBusy(button);
    state.generationAbort = null;
    $("recordState").textContent = t("recordIdle");
    qs(".record-card")?.removeAttribute("data-active");
  }
}

async function askQuestion(question) {
  const q = question || $("questionInput").value.trim();
  if (!q) return;
  addChat("user", q);
  state.assistantHistory.push({ role: "user", content: q });
  state.assistantHistory = state.assistantHistory.slice(-10);
  $("questionInput").value = "";
  const thinkingNode = showAssistantThinking();
  try {
    const result = await api("/api/minutes/ask", {
      method: "POST",
      body: JSON.stringify({
        question: q,
        transcript: getTranscript(),
        minutes: state.minutes,
        history: state.assistantHistory.slice(0, -1)
      })
    });
    thinkingNode?.remove();
    addChat("assistant", result.answer, result.citations || []);
    state.assistantHistory.push({ role: "assistant", content: result.answer || "" });
    state.assistantHistory = state.assistantHistory.slice(-10);
  } catch (error) {
    thinkingNode?.remove();
    addChat("assistant", error.message);
  }
}

function buildOptimizedMinutes(minutes = state.minutes || createEmptyMinutes()) {
  const next = structuredClone(minutes);
  const taskCount = next.actionItems?.length || 0;
  const decisionCount = next.decisions?.length || 0;
  next.summary = `${next.summary || "待确认"}\n\nAI优化建议：本次会议形成 ${decisionCount} 条决策、${taskCount} 条待办。建议会后优先核对待确认负责人、截止日期和关键风险。`;
  next.decisions = (next.decisions || []).map((item) => item.includes("待确认") ? item : `${item}（已核对表达）`);
  next.risks = (next.risks || []).length ? next.risks : ["待确认：当前纪要未识别到明确风险，请人工核对原文。"];
  return next;
}

async function optimizeMinutes() {
  if (!state.minutes) return toast("请先生成纪要", "error");
  const before = state.minutes.summary || "待确认";
  const optimized = buildOptimizedMinutes(state.minutes);
  const after = optimized.summary || "待确认";
  const ok = await openModal({
    title: "确认 AI 优化",
    description: `修改前：${before.slice(0, 180)}\n\n修改后：${after.slice(0, 260)}`,
    confirmText: "应用优化",
    cancelText: "保留原文"
  });
  if (!ok) return;
  state.minutesVersions.push(structuredClone(state.minutes));
  renderMinutes(optimized);
  markDirty();
  toast("AI 优化已应用，可撤销到上一版");
}

async function saveMeetingLegacy() {
  if (!state.minutes) return toast("请先生成纪要", "error");
  const meeting = await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      title: $("meetingTitle").textContent || "未命名会议",
      transcript: getTranscript(),
      minutes: state.minutes
    })
  });
  state.meetings.unshift(meeting.meeting);
  renderMeetings();
  $("saveState").textContent = `已保存 ${nowLabel()}`;
  toast("会议已保存到历史记录");
}

async function saveMeetingOld() {
  if (!state.minutes) return toast("请先生成纪要", "error");
  const payload = {
    title: $("meetingTitle").textContent || "未命名会议",
    transcript: getTranscript(),
    minutes: state.minutes
  };
  const updating = Boolean(state.currentMeetingId);
  const result = await api(updating ? `/api/meetings/${encodeURIComponent(state.currentMeetingId)}` : "/api/meetings", {
    method: updating ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  const saved = result.meeting;
  state.currentMeetingId = saved.id;
  const existingIndex = state.meetings.findIndex((meeting) => meeting.id === saved.id);
  if (existingIndex >= 0) state.meetings.splice(existingIndex, 1, saved);
  else state.meetings.unshift(saved);
  renderMeetings();
  $("saveState").textContent = `已保存 ${nowLabel()}`;
  $("saveState").dataset.state = "saved";
  toast(existingIndex >= 0 ? "会议修改已保存" : "会议已保存到历史记录");
}

async function saveMeeting() {
  if (state.saving) return;
  if (!state.minutes) return toast("请先生成纪要", "error");
  const payload = {
    title: $("meetingTitle").textContent || defaultMeetingTitle(),
    transcript: getTranscript(),
    minutes: state.minutes,
    meetingTime: state.currentMeetingTime
  };
  const updating = Boolean(state.currentMeetingId);
  const button = $("saveMeetingBtn");
  state.saving = true;
  setDocumentStatus("saving");
  setBusy(button, "保存中...");
  try {
    const result = await api(updating ? `/api/meetings/${encodeURIComponent(state.currentMeetingId)}` : "/api/meetings", {
      method: updating ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    const saved = result.meeting;
    state.currentMeetingId = saved.id;
    state.currentMeetingTime = saved.meetingTime || payload.meetingTime;
    const existingIndex = state.meetings.findIndex((meeting) => meeting.id === saved.id);
    if (existingIndex >= 0) state.meetings.splice(existingIndex, 1, saved);
    else state.meetings.unshift(saved);
    renderMeetings();
    setDocumentStatus("saved", nowLabel());
    toast(existingIndex >= 0 ? "会议修改已保存" : "会议已保存到历史记录");
  } catch (error) {
    setDocumentStatus("error");
    toast(`保存失败：${error.message}。请重试。`, "error");
  } finally {
    state.saving = false;
    clearBusy(button);
  }
}

async function transcribeAudio(file) {
  if (!file) return;
  if (state.transcribing) return toast("正在识别音频，请稍候或先取消。");
  state.lastAudioFile = file;
  state.lastTranscriptionFailed = false;
  if (!state.provider?.demoMode && !state.provider?.hasApiKey) {
    setTranscriptionUi("识别失败", { failed: true });
    $("audioFile").value = "";
    const goSettings = await openModal({
      title: "上传音频需要千问 API Key",
      description: "本地音频会先上传到后端，再由后端调用千问 qwen3-asr-flash。请先在设置页填写 API Key。",
      confirmText: "前往设置",
      cancelText: "先不配置"
    });
    if (goSettings) activateView("settings");
    return;
  }
  const formData = new FormData();
  setTranscriptionUi("正在读取音频", { active: true });
  formData.append("audio", file);
  state.transcribing = true;
  state.transcriptionAbort = new AbortController();
  try {
    setTranscriptionUi("正在上传音频", { active: true });
    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
      signal: state.transcriptionAbort.signal
    });
    setTranscriptionUi("正在调用千问识别", { active: true });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "转写失败");
    setTranscriptionUi("正在整理识别结果", { active: true });
    const nextTranscript = result.transcript || "";
    if (!nextTranscript) throw new Error("识别完成但没有返回文字，请换一段更清晰的音频重试。");
    const existing = getTranscript();
    if (existing) {
      const choice = await openModal({
        title: "识别完成",
        description: "原始文本编辑区已有内容。请选择如何处理本次识别结果。",
        confirmText: "替换原有内容",
        extraText: "追加到原有内容",
        cancelText: "取消"
      });
      if (choice === true) setTranscript(nextTranscript);
      else if (choice === "extra") setTranscript(`${existing}\n\n${nextTranscript}`.trim());
      else return;
    } else {
      setTranscript(nextTranscript);
    }
    $("sourceMode").textContent = "千问语音识别";
    setTranscriptionUi("识别完成");
    toast("识别结果已写入会议原文");
  } catch (error) {
    if (error.name === "AbortError") {
      setTranscriptionUi("已取消");
      toast("已取消识别");
    } else {
      state.lastTranscriptionFailed = true;
      setTranscriptionUi("识别失败", { failed: true });
      toast(error.message, "error");
    }
  } finally {
    state.transcribing = false;
    state.transcriptionAbort = null;
    $("audioFile").value = "";
    if (!state.lastTranscriptionFailed && $("recordState").textContent !== "识别完成") {
      setTranscriptionUi(t("recordIdle"));
    }
  }
}

function toggleRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) return toggleSpeechRecognition(SpeechRecognition);
  return toggleMediaRecording();
}

function toggleSpeechRecognition(SpeechRecognition) {
  if (state.recording && state.speechRecognition) {
    state.speechRecognition.stop();
    return;
  }

  const recognition = new SpeechRecognition();
  let finalText = "";
  recognition.lang = state.preferences.language;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.recording = true;
    state.speechRecognition = recognition;
    $("recordBtn").textContent = "停止录音";
    $("recordState").textContent = "实时识别中";
    $("sourceMode").textContent = "语音识别";
    qs(".record-card")?.setAttribute("data-active", "true");
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text;
      else interim += text;
    }
    $("transcriptInput").value = `${state.transcriptDraft}\n${finalText}${interim}`.trim();
    updateWordCount();
  };

  recognition.onerror = (event) => {
    toast(`语音识别失败：${event.error}`, "error");
  };

  recognition.onend = () => {
    state.recording = false;
    state.speechRecognition = null;
    $("recordBtn").textContent = "开始录音";
    $("recordState").textContent = finalText ? "识别完成" : "待录入";
    qs(".record-card")?.removeAttribute("data-active");
    state.transcriptDraft = getTranscript();
    pushHistory(getTranscript());
  };

  recognition.start();
}

async function toggleMediaRecording() {
  if (state.recording && state.mediaRecorder) {
    state.mediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("当前浏览器不支持录音，请上传音频或粘贴文本", "error");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.chunks = [];
  state.mediaRecorder = new MediaRecorder(stream);
  state.mediaRecorder.ondataavailable = (event) => state.chunks.push(event.data);
  state.mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());
    state.recording = false;
    $("recordBtn").textContent = "开始录音";
    const blob = new Blob(state.chunks, { type: "audio/webm" });
    await transcribeAudio(new File([blob], "meeting.webm", { type: "audio/webm" }));
  };
  state.mediaRecorder.start();
  state.recording = true;
  $("recordBtn").textContent = "停止录音";
  $("recordState").textContent = "录音中";
  qs(".record-card")?.setAttribute("data-active", "true");
}

function cancelRecording() {
  if (state.transcribing && state.transcriptionAbort) {
    state.transcriptionAbort.abort();
    return;
  }
  if (state.lastTranscriptionFailed && state.lastAudioFile) {
    transcribeAudio(state.lastAudioFile);
    return;
  }
  if (state.speechRecognition) state.speechRecognition.stop();
  if (state.mediaRecorder && state.recording) state.mediaRecorder.stop();
  state.recording = false;
  $("recordBtn").textContent = "开始录音";
  $("recordState").textContent = "已取消";
  qs(".record-card")?.removeAttribute("data-active");
  toast("已取消当前采集");
}

function undoTranscript() {
  if (state.historyIndex <= 0) return toast("没有可撤销的内容");
  state.historyIndex -= 1;
  $("transcriptInput").value = state.history[state.historyIndex];
  updateWordCount();
  toast("已撤销文本修改");
}

function redoTranscript() {
  if (state.historyIndex >= state.history.length - 1) return toast("没有可重做的内容");
  state.historyIndex += 1;
  $("transcriptInput").value = state.history[state.historyIndex];
  updateWordCount();
  toast("已重做文本修改");
}

async function shareMeeting() {
  const text = buildMarkdown();
  try {
    await navigator.clipboard.writeText(text);
    toast("纪要已复制，可直接分享");
  } catch {
    toast("浏览器不允许复制，请使用导出功能");
  }
}

function exportMeeting() {
  const blob = new Blob([buildMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "meeting-minutes.md";
  a.click();
  URL.revokeObjectURL(url);
  toast("已导出 Markdown 文件");
}

function buildMarkdown() {
  const m = state.minutes || fallbackMinutes;
  const taskRows = (m.actionItems || []).map((item) => `- [${item.status === "已完成" ? "x" : " "}] ${item.content}（${item.owner}，${item.dueDate}，${item.priority}）`).join("\n");
  return [
    `# ${$("meetingTitle").textContent || "会议纪要"}`,
    "",
    `会议时间：${formatMeetingDate(state.currentMeetingTime)}`,
    "",
    `## 摘要\n${m.summary || ""}`,
    "",
    `## 参会人\n${(m.participants || []).join("、") || "待确认"}`,
    "",
    `## 讨论要点\n${(m.discussionPoints || []).map((item) => `- ${item}`).join("\n")}`,
    "",
    `## 决策\n${(m.decisions || []).map((item) => `- ${item}`).join("\n")}`,
    "",
    `## 风险\n${(m.risks || []).map((item) => `- ${item}`).join("\n")}`,
    "",
    `## 待办\n${taskRows || "- 待确认"}`,
    "",
    `## 原始文本\n${getTranscript()}`
  ].join("\n");
}

function searchTranscript() {
  const term = $("searchInput").value.trim();
  if (!term) return toast("请输入要搜索的内容");
  const textarea = $("transcriptInput");
  const index = textarea.value.indexOf(term);
  if (index < 0) return toast("没有找到匹配内容");
  textarea.focus();
  textarea.setSelectionRange(index, index + term.length);
  toast("已定位到匹配内容");
}

async function renameMeeting() {
  const current = $("meetingTitle").textContent;
  const next = await openModal({
    title: "重命名会议",
    description: "修改后的标题会在保存时同步到历史记录。",
    inputValue: current,
    confirmText: "保存标题",
    prompt: true
  });
  if (!next || next.trim() === current) return;
  $("meetingTitle").textContent = next.trim();
  markDirty();
  toast("会议标题已更新");
  if (state.activeDoc === "minutes") renderMinutes(state.minutes);
}

function setDocTab(tab) {
  document.querySelectorAll("[data-doc-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.docTab === tab);
  });
}

function setSourceTab(tab) {
  document.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.sourceTab === tab);
  });
}

function showSmartSummaryInSource() {
  state.transcriptDraft = getTranscript();
  const m = state.minutes || fallbackMinutes;
  state.smartSummaryDraft = [
    "智能摘要",
    "",
    m.summary || "暂无摘要",
    "",
    "待办概览：",
    ...(m.actionItems || []).map((item) => `- ${item.owner}：${item.content}，${item.dueDate}，${item.status}`)
  ].join("\n");
  $("transcriptInput").value = state.smartSummaryDraft;
  setSourceTab("summary");
  updateWordCount();
}

function showOriginalTranscriptInSource() {
  $("transcriptInput").value = state.transcriptDraft || sampleTranscript;
  setSourceTab("transcript");
  updateWordCount();
}

function activateView(view) {
  state.activeView = view;
  document.body.dataset.workspaceView = view;
  if (!["minutes", "assistant"].includes(view)) document.body.classList.remove("assistant-open");
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  updateTopActions();
  if (view === "record") renderCaptureHome();
  if (view === "minutes") renderMinutes(state.minutes || fallbackMinutes);
  if (view === "assistant") renderMinutes(state.minutes || fallbackMinutes);
  if (view === "history") renderHistoryView();
  if (view === "tasks") renderTasksDocument();
  if (view === "settings") renderSettingsView();
}

function updateTopActions() {
  const primaryByView = {
    record: "generateBtn",
    minutes: "saveMeetingBtn",
    tasks: "addTaskTopBtn",
    history: "newMeetingBtn",
    settings: "saveMeetingBtn"
  };
  const utilityIds = ["assistantToggleBtn", "settingsShortcutBtn", "shareBtn", "exportBtn"];
  const primaryId = primaryByView[state.activeView] || "generateBtn";
  ["newMeetingBtn", "addTaskTopBtn", "saveMeetingBtn", "generateBtn"].forEach((id) => {
    const node = $(id);
    if (node) node.hidden = id !== primaryId && !(id === "newMeetingBtn" && document.body.classList.contains("more-open"));
  });
  utilityIds.forEach((id) => {
    const node = $(id);
    if (node) node.classList.toggle("more-hidden", !document.body.classList.contains("more-open"));
  });
  const more = $("moreActionsBtn");
  if (more) more.hidden = false;
}

function renderHistoryView() {
  const rows = state.meetings.map((meeting) => `
    <article class="history-card" data-id="${meeting.id}">
      <div>
        <strong>${escapeHtml(meeting.title)}</strong>
        <span>${formatMeetingDate(meeting.meetingTime || meeting.createdAt)}</span>
        <p>${escapeHtml(meeting.minutes?.summary || meeting.transcript.slice(0, 120))}</p>
      </div>
      <div class="history-actions">
        <button class="secondary meeting-open" type="button" data-id="${meeting.id}">${t("open")}</button>
        <button class="ghost danger meeting-delete" type="button" data-id="${meeting.id}">${t("delete")}</button>
      </div>
    </article>
  `).join("") || `<div class="utility-card"><strong>${t("noHistory")}</strong><p>${t("noHistoryDesc")}</p></div>`;
  renderUtilityDocument(t("historyTitle"), t("historyDesc"), rows);
  document.querySelectorAll(".meeting-open").forEach((button) => button.addEventListener("click", () => openMeeting(button.dataset.id)));
  document.querySelectorAll(".meeting-delete").forEach((button) => button.addEventListener("click", () => deleteMeeting(button.dataset.id)));
}

function renderKnowledgeView() {
  renderUtilityDocument("项目知识库", "用于答辩说明与后续扩展，当前版本保留轻量检索入口。", `
    <div class="utility-card"><strong>课程目标</strong><p>用 AI 编程辅助工具完成一个日常办公场景下的提效助手，当前选题为会议纪要助手。</p></div>
    <div class="utility-card"><strong>数据来源</strong><p>支持自拟模拟会议语料、公开会议转写文本、浏览器实时语音识别和上传音视频转写。</p></div>
    <div class="utility-card"><strong>核心功能</strong><p>前端可输入与展示结果；后端调用 LLM API 生成结构化纪要、待办和追问回答。</p></div>
    <div class="utility-card"><strong>技术路线</strong><p>Prompt + LLM API + Node.js 后端代理 + 本地 JSON 历史存储；后续可升级向量检索和多轮 Agent。</p></div>
    <div class="utility-card"><strong>RAG 扩展</strong><p>可把历史会议、项目文档、FAQ 或运营知识库切分入库，通过向量检索增强回答依据。</p></div>
    <div class="utility-card"><strong>Agent 扩展</strong><p>可增加工具调用：创建日程、生成周报、同步任务系统、检索历史相似会议和自动补充风险。</p></div>
    <div class="utility-card"><strong>安全设计</strong><p>访问密钥只保存在服务端配置文件，前端仅展示是否已配置，避免浏览器泄露密钥。</p></div>
    <button class="utility-card" id="knowledgeAskBtn" type="button"><strong>让 AI 总结技术亮点</strong><p>点击后会在右侧助手中生成一段答辩说明。</p></button>
  `);
  $("knowledgeAskBtn")?.addEventListener("click", () => askQuestion("请基于当前项目说明，概括这个会议纪要助手的技术亮点和课程要求匹配点。"));
}

function renderTemplateView() {
  renderUtilityDocument("纪要模板", "选择模板会替换左侧示例文本，并保留模型生成能力。", `
    <button class="utility-card template-card" type="button" data-template="weekly"><strong>项目周会</strong><p>适合进度同步、风险识别、责任分派和下周计划。</p></button>
    <button class="utility-card template-card" type="button" data-template="review"><strong>运营复盘</strong><p>适合数据表现、原因分析、实验结论和优化动作。</p></button>
    <button class="utility-card template-card" type="button" data-template="client"><strong>客户访谈</strong><p>适合需求收集、异议整理、机会点和跟进安排。</p></button>
  `);
  document.querySelectorAll(".template-card").forEach((button) => {
    button.addEventListener("click", () => applyTemplate(button.dataset.template));
  });
}

function applyTemplate(type) {
  const templates = {
    weekly: sampleTranscript,
    review: "运营复盘会：参会人包括王强、李娜、赵越。会议回顾本周活动转化率下降 8%，主要原因是落地页加载慢、优惠说明不清晰。会议决定周五前完成落地页压缩，李娜负责文案改版，赵越负责数据看板复核。风险是渠道投放预算已经接近上限。",
    client: "客户访谈会：客户重点反馈报表导出速度慢、权限配置复杂、移动端审批入口不明显。产品团队决定下个版本优先优化导出性能，并增加权限模板。刘晨负责收集更多客户样本，截止下周三。"
  };
  setTranscript(templates[type] || sampleTranscript);
  activateView("record");
  toast("模板已应用，可直接生成纪要");
}

function renderSettingsView() {
  renderUtilityDocument(t("settingsTitle"), t("settingsDesc"), `
    <form id="workspaceSettingsForm" class="settings-page">
      <section class="settings-group">
        <div class="settings-copy">
          <strong>${t("modelConfig")}</strong>
          <span>${t("modelConfigDesc")}</span>
        </div>
        <div class="settings-fields">
          <label>${t("modelEndpoint")}<input id="settingsChatEndpointInput" /></label>
          <label>${t("minutesModel")}<input id="settingsChatModelInput" /></label>
          <label>${t("transcribeModel")}<input id="settingsTranscribeModelInput" /></label>
          <label>${t("accessKey")}<input id="settingsApiKeyInput" type="password" placeholder="${t("keepKey")}" autocomplete="off" /></label>
          <label class="toggle-row"><input id="settingsDemoModeInput" type="checkbox" /> ${t("useDemo")}</label>
        </div>
      </section>

      <section class="settings-group">
        <div class="settings-copy">
          <strong>${t("preferences")}</strong>
          <span>${t("preferencesDesc")}</span>
        </div>
        <div class="settings-fields compact-fields">
          <label>${t("language")}
            <select id="settingsLanguageInput">
              <option value="zh-CN">${t("zh")}</option>
              <option value="en-US">${t("en")}</option>
            </select>
          </label>
          <label>${t("tone")}
            <select id="settingsToneInput">
              <option value="teal">${t("teal")}</option>
              <option value="blue">${t("blueTone")}</option>
              <option value="green">${t("greenTone")}</option>
              <option value="slate">${t("slate")}</option>
            </select>
          </label>
          <label>${t("density")}
            <select id="settingsDensityInput">
              <option value="comfortable">${t("comfortable")}</option>
              <option value="compact">${t("compact")}</option>
            </select>
          </label>
        </div>
      </section>

      <div class="settings-footer-actions">
        <button id="settingsPresetBtn" class="secondary" type="button">${t("preset")}</button>
        <button class="primary" type="submit">${t("saveSettings")}</button>
      </div>
    </form>
  `);
  syncSettingsPage(state.provider || {});
  $("workspaceSettingsForm")?.addEventListener("submit", saveWorkspaceSettings);
  $("settingsPresetBtn")?.addEventListener("click", () => {
    fillQwenPreset();
    syncSettingsPage(state.provider || {});
    $("settingsChatEndpointInput").value = $("chatEndpointInput").value;
    $("settingsChatModelInput").value = $("chatModelInput").value;
    $("settingsTranscribeModelInput").value = $("transcribeModelInput").value;
  });
}

function handleTool(tool) {
  if (tool === "bold") {
    $("minutesDoc").classList.toggle("format-bold");
    return toast("已切换加粗预览");
  }
  if (tool === "italic") {
    $("minutesDoc").classList.toggle("format-italic");
    return toast("已切换斜体预览");
  }
  if (tool === "timestamp") {
    const textarea = $("transcriptInput");
    textarea.value = `${textarea.value}\n[${nowLabel()}] `.trimStart();
    textarea.focus();
    updateWordCount();
    return toast("已插入当前时间");
  }
  if (tool === "action") return addTask();
  if (tool === "copy") return shareMeeting();
}

async function saveSettings() {
  try {
    const provider = await api("/api/settings/provider", {
      method: "PUT",
      body: JSON.stringify({
        chatEndpoint: $("chatEndpointInput").value.trim(),
        transcribeEndpoint: "",
        chatModel: $("chatModelInput").value.trim(),
        transcribeModel: $("transcribeModelInput").value.trim(),
        apiKey: $("apiKeyInput").value.trim(),
        demoMode: $("demoModeInput").checked
      })
    });
    $("apiKeyInput").value = "";
    updateProviderStatus(provider);
    syncSettingsPage(provider);
    toast(provider.demoMode ? "已开启演示模式" : "模型配置已保存");
  } catch (error) {
    toast(error.message, "error");
  }
}

function applyPreferences() {
  document.documentElement.lang = state.preferences.language;
  document.body.dataset.tone = state.preferences.tone;
  document.body.dataset.density = state.preferences.density;
  applyLanguageToStatic();
  $("transcriptInput")?.setAttribute(
    "placeholder",
    t("transcriptPlaceholder")
  );
  updateProviderStatus(state.provider || { demoMode: true, hasApiKey: false });
  updateWordCount();
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

function applyLanguageToStatic() {
  setText('[data-view="record"]', t("navRecord"));
  setText('[data-view="minutes"]', t("navMinutes"));
  setText('[data-view="tasks"]', t("navTasks"));
  setText('[data-view="history"]', t("navHistory"));
  setText('[data-view="assistant"]', t("navAssistant"));
  setText('[data-view="settings"]', t("navSettings"));
  setText("#shareBtn", t("share"));
  setText("#exportBtn", t("export"));
  setText("#saveMeetingBtn", t("saveMeeting"));
  setText("#generateBtn", t("generate"));
  setText("#newMeetingBtn", state.preferences.language === "en-US" ? "New meeting" : "新建会议");
  setText("#addTaskTopBtn", t("addTask"));
  setText("#moreActionsBtn", state.preferences.language === "en-US" ? "More" : "更多");
  setText(".source-panel .eyebrow", t("sourceEyebrow"));
  setText(".source-panel h2", t("sourceTitle"));
  if ($("sourceMode")) $("sourceMode").textContent = t("sourceModeText");
  const uploadButton = document.querySelector(".upload-button");
  let uploadInput = $("audioFile");
  if (uploadButton) {
    uploadButton.textContent = t("upload");
    if (!uploadInput) {
      uploadInput = document.createElement("input");
      uploadInput.id = "audioFile";
      uploadInput.type = "file";
      uploadInput.accept = "audio/*,video/*";
      uploadInput.addEventListener("change", (event) => transcribeAudio(event.target.files[0]));
    }
    uploadButton.appendChild(uploadInput);
  }
  setText("#loadSampleBtn", t("sample"));
  setText("#recordBtn", t("record"));
  setText("#clearTranscriptBtn", t("clear"));
  setText("#recordState", t("recordIdle"));
  setText(".record-card span", t("recordHelp"));
  setText("#cancelRecordBtn", t("cancel"));
  setText('[data-source-tab="transcript"]', t("rawTranscript"));
  setText('[data-source-tab="summary"]', t("smartSummary"));
  if ($("searchInput")) $("searchInput").placeholder = t("searchPlaceholder");
  setText("#searchBtn", t("locate"));
  setText(".history-dock .section-title span", t("recentMeetings"));
  setText('[data-doc-tab="minutes"]', t("docMinutes"));
  setText('[data-doc-tab="raw"]', t("docRaw"));
  setText('[data-doc-tab="tasks"]', t("docTasks"));
  setText('[data-tool="action"]', t("addTask"));
  setText('[data-tool="copy"]', t("copyMinutes"));
  setText("#toolbarGenerateBtn", t("optimize"));
  setText(".assistant-head .eyebrow", t("assistantEyebrow"));
  setText(".assistant-head h2", t("assistantTitle"));
  setText(".assistant-greeting", t("assistantGreeting"));
  const quickLabels = [t("qDecision"), t("qOwner"), t("qRisk"), t("qWeekly")];
  document.querySelectorAll(".quick-actions button").forEach((button, index) => {
    button.textContent = quickLabels[index] || button.textContent;
  });
  if ($("questionInput")) $("questionInput").placeholder = t("questionPlaceholder");
  setText(".send-button", t("send"));
}

function syncSettingsPage(provider = state.provider || {}) {
  if (!$("settingsChatEndpointInput")) return;
  $("settingsChatEndpointInput").value = provider.chatEndpoint || $("chatEndpointInput")?.value || "";
  $("settingsChatModelInput").value = provider.chatModel || $("chatModelInput")?.value || "";
  $("settingsTranscribeModelInput").value = provider.transcribeModel || $("transcribeModelInput")?.value || "";
  $("settingsDemoModeInput").checked = Boolean(provider.demoMode ?? $("demoModeInput")?.checked);
  $("settingsApiKeyInput").value = "";
  $("settingsLanguageInput").value = state.preferences.language;
  $("settingsToneInput").value = state.preferences.tone;
  $("settingsDensityInput").value = state.preferences.density;
}

async function saveWorkspaceSettings(event) {
  event.preventDefault();
  state.preferences.language = $("settingsLanguageInput").value;
  state.preferences.tone = $("settingsToneInput").value;
  state.preferences.density = $("settingsDensityInput").value;
  localStorage.setItem("mma-language", state.preferences.language);
  localStorage.setItem("mma-tone", state.preferences.tone);
  localStorage.setItem("mma-density", state.preferences.density);
  applyPreferences();

  $("chatEndpointInput").value = $("settingsChatEndpointInput").value.trim();
  $("chatModelInput").value = $("settingsChatModelInput").value.trim();
  $("transcribeEndpointInput").value = "";
  $("transcribeModelInput").value = $("settingsTranscribeModelInput").value.trim();
  $("apiKeyInput").value = $("settingsApiKeyInput").value.trim();
  $("demoModeInput").checked = $("settingsDemoModeInput").checked;
  await saveSettings();
  activateView(state.activeView);
}

function fillQwenPreset() {
  $("chatEndpointInput").value = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  $("chatModelInput").value = "qwen-plus";
  $("transcribeEndpointInput").value = "";
  $("transcribeModelInput").value = "qwen3-asr-flash";
  $("demoModeInput").checked = false;
  toast("已填入千问推荐配置");
}

function enterWorkspace(view = "record") {
  document.body.classList.remove("landing-mode");
  activateView(view);
  window.scrollTo({ top: 0, left: 0 });
}

function previewDemo() {
  setTranscript(sampleTranscript, false);
  renderMinutes(fallbackMinutes);
  enterWorkspace("minutes");
  toast("已打开示例会议纪要");
}

function wireEvents() {
  const on = (id, event, handler) => $(id)?.addEventListener(event, handler);
  $("openWorkspaceBtn")?.addEventListener("click", () => enterWorkspace("record"));
  $("startWorkspaceBtn")?.addEventListener("click", () => enterWorkspace("record"));
  document.querySelectorAll("[data-start-workspace]").forEach((button) => {
    button.addEventListener("click", () => enterWorkspace("record"));
  });
  $("previewDemoBtn")?.addEventListener("click", previewDemo);
  on("loadSampleBtn", "click", () => {
    setTranscript(sampleTranscript);
    $("sourceMode").textContent = "示例文本";
    toast("已导入示例会议文本");
  });
  on("clearTranscriptBtn", "click", () => {
    setTranscript("");
    toast("文本区已清空");
  });
  on("recordBtn", "click", toggleRecording);
  on("cancelRecordBtn", "click", cancelRecording);
  on("audioFile", "change", (event) => transcribeAudio(event.target.files[0]));
  document.querySelector(".upload-button")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("audioFile")?.click();
    }
  });
  on("generateBtn", "click", generateMinutes);
  on("toolbarGenerateBtn", "click", optimizeMinutes);
  on("saveMeetingBtn", "click", saveMeeting);
  on("newMeetingBtn", "click", () => startNewMeeting(true));
  on("addTaskTopBtn", "click", addTask);
  on("moreActionsBtn", "click", () => {
    document.body.classList.toggle("more-open");
    updateTopActions();
  });
  on("undoBtn", "click", undoTranscript);
  on("redoBtn", "click", redoTranscript);
  on("shareBtn", "click", shareMeeting);
  on("exportBtn", "click", exportMeeting);
  on("assistantToggleBtn", "click", () => {
    if (state.activeView === "record") activateView("minutes");
    document.body.classList.toggle("assistant-open");
  });
  on("settingsShortcutBtn", "click", () => activateView("settings"));
  on("searchBtn", "click", searchTranscript);
  on("searchInput", "keydown", (event) => {
    if (event.key === "Enter") searchTranscript();
  });
  on("meetingTitle", "click", renameMeeting);
  on("providerStatus", "click", () => {
    activateView("settings");
    toast("已打开设置");
  });
  on("toggleSettingsBtn", "click", () => {
    $("settingsPanel").classList.toggle("collapsed");
    $("toggleSettingsBtn").textContent = $("settingsPanel").classList.contains("collapsed") ? "展开" : "收起";
  });
  on("workingPresetBtn", "click", fillQwenPreset);
  on("qwenDefaultBtn", "click", fillQwenPreset);
  on("saveSettingsBtn", "click", saveSettings);
  on("askForm", "submit", (event) => {
    event.preventDefault();
    askQuestion();
  });
  on("transcriptInput", "input", () => {
    state.transcriptDraft = getTranscript();
    updateWordCount();
    markDirty();
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(() => pushHistory(getTranscript()), 500);
  });

  document.querySelector(".app-nav")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) activateView(button.dataset.view);
  });
  document.querySelectorAll(".rail-item").forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.view));
  });
  $("collapseRailBtn")?.addEventListener("click", () => {
    document.body.classList.toggle("rail-collapsed");
    toast(document.body.classList.contains("rail-collapsed") ? "左侧导航已收起" : "左侧导航已展开");
  });
  document.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.addEventListener("click", () => button.dataset.sourceTab === "summary" ? showSmartSummaryInSource() : showOriginalTranscriptInSource());
  });
  document.querySelectorAll("[data-doc-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.docTab === "minutes") renderMinutes(state.minutes || fallbackMinutes);
      if (button.dataset.docTab === "raw") renderRawDocument();
      if (button.dataset.docTab === "tasks") renderTasksDocument();
    });
  });
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => handleTool(button.dataset.tool));
  });
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => askQuestion(button.dataset.command));
  });
}

applyPreferences();
wireEvents();
setTranscript(sampleTranscript, false);
renderCaptureHome();
updateTopActions();
updateWordCount();
addChat("assistant", "你好，我会基于当前会议原文回答问题，并尽量给出引用依据。你可以先生成纪要，再追问负责人、风险或决策。");

try {
  await loadProvider();
  await loadMeetings();
} catch (error) {
  toast(`初始化失败：${error.message}`, "error");
}

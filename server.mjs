import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const dataDir = join(root, "data");
const dbPath = join(dataDir, "db.json");
const port = Number(process.env.PORT || 4173);
const dashScopeCompatBase = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const maxShortAudioBytes = 7 * 1024 * 1024;
const allowedAudioExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".webm", ".ogg", ".flac"]);
const allowedAudioMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "application/ogg"
]);

const sampleTranscript = `项目组周会，时间为 2026 年 6 月 19 日。参会人包括张敏、李哲、王一凡和陈可。
张敏说明本周完成了登录页改版，下一步要补充移动端适配。李哲反馈语音转文字接口已经跑通，但长音频需要分段上传。
王一凡提出演示文稿还缺少技术路线图和测试截图，建议周日前补齐。陈可提醒访问密钥不能放在前端，需要通过后端代理调用模型。
会议决定本周先完成会议纪要助手的可演示版本，支持粘贴会议文本、生成结构化纪要、追问会议细节和保存历史记录。
待办事项：张敏负责完善页面交互，截止周六；李哲负责接口联调，截止周日；王一凡负责整理课程汇报材料，截止下周一。`;

const defaultProvider = {
  chatEndpoint: dashScopeCompatBase,
  transcribeEndpoint: "",
  chatModel: "qwen-plus",
  fallbackModels: [],
  transcribeModel: "qwen3-asr-flash",
  apiKey: "",
  demoMode: false,
  updatedAt: ""
};

const defaultDb = {
  provider: defaultProvider,
  meetings: [
    buildMeeting({
      title: "项目组周会",
      transcript: sampleTranscript,
      minutes: makeDemoMinutes(sampleTranscript)
    })
  ]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function buildMeeting({ title, transcript, minutes, meetingTime }) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    meetingTime: meetingTime || now,
    transcript,
    minutes,
    createdAt: now,
    updatedAt: now
  };
}

function emptyMinutes() {
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

function makeFixedDemoMinutes() {
  return {
    participants: ["张敏", "李哲", "王一凡", "陈可"],
    agenda: ["项目进度同步", "语音转文字接口联调", "课程演示材料准备", "API Key 安全调用"],
    discussionPoints: [
      "本周优先完成可演示版本，覆盖会议文本输入、纪要生成、追问和历史保存。",
      "语音转文字接口已跑通基础流程，长音频需要切片或分段处理。",
      "课程汇报需要补充技术路线图、Prompt 设计和测试截图。",
      "模型调用应通过服务端代理，避免在前端暴露 API Key。"
    ],
    decisions: [
      "选择场景 A：会议纪要助手，聚焦项目组周会和运营复盘会。",
      "首版采用 Prompt + LLM API + 本地历史检索，不强制实现完整 RAG。",
      "默认真实 API 模式；只有主动开启演示模式时才使用模拟结果。"
    ],
    risks: [
      "真实转写服务可能受网络、额度或音频格式限制影响。",
      "模型输出需要 JSON 约束和兜底解析，避免页面无法展示。",
      "如果 API Key 写入前端，会不符合安全设计要求。"
    ],
    actionItems: [
      { id: crypto.randomUUID(), content: "完善会议纪要助手页面交互", owner: "张敏", dueDate: "周六", priority: "高", status: "进行中" },
      { id: crypto.randomUUID(), content: "完成语音转文字与 LLM 接口联调", owner: "李哲", dueDate: "周日", priority: "高", status: "未开始" },
      { id: crypto.randomUUID(), content: "整理课程汇报材料和测试截图", owner: "王一凡", dueDate: "下周一", priority: "中", status: "未开始" }
    ],
    summary: "本次会议确认以 AI 会议纪要助手作为课程项目，先完成可演示的 Web 工具，重点展示会议内容输入、结构化纪要生成、待办提取、AI 追问和 API 可配置能力。"
  };
}

function splitSentences(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function extractParticipants(text) {
  const match = text.match(/参会人(?:包括|有|：|:)?([^。；;\n]+)/);
  if (!match) return [];
  return unique(match[1].split(/[、,，和及\s]+/).map((item) => item.trim()).filter((item) => item.length >= 2 && item.length <= 8));
}

function extractActionItems(sentences) {
  const ownerPattern = /([\u4e00-\u9fa5A-Za-z]{2,12})\s*(?:负责|跟进|完成|整理|补充|对接)([^。；;，,]*)/;
  return sentences
    .filter((sentence) => /负责|待办|截止|下周|周[一二三四五六日天]|完成|跟进/.test(sentence))
    .slice(0, 6)
    .map((sentence, index) => {
      const ownerMatch = sentence.match(ownerPattern);
      const dueMatch = sentence.match(/(今天|明天|本周|下周[一二三四五六日天]?|周[一二三四五六日天]|月底|月末|\d{1,2}月\d{1,2}日)/);
      return {
        id: crypto.randomUUID(),
        content: (ownerMatch?.[2] || sentence).replace(/^[:：,，]/, "").trim() || sentence,
        owner: ownerMatch?.[1] || "待确认",
        dueDate: dueMatch?.[1] || "待确认",
        priority: /优先|紧急|高/.test(sentence) ? "高" : "中",
        status: "未开始",
        source: sentence,
        sourceTime: `00:${String(index + 1).padStart(2, "0")}:00`
      };
    });
}

function makeDemoMinutes(transcript = sampleTranscript) {
  const text = String(transcript || "").trim();
  if (!text || text === sampleTranscript) return makeFixedDemoMinutes();
  const sentences = splitSentences(text);
  const participants = extractParticipants(text);
  const decisions = sentences.filter((item) => /决定|确认|通过|采用|选择|同意/.test(item)).slice(0, 5);
  const risks = sentences.filter((item) => /风险|问题|阻塞|延期|不能|缺少|失败|错误/.test(item)).slice(0, 5);
  const actionItems = extractActionItems(sentences);
  const agenda = sentences.slice(0, 3);
  const discussionPoints = sentences.filter((item) => !decisions.includes(item)).slice(0, 6);
  return {
    participants: participants.length ? participants : ["待确认"],
    agenda: agenda.length ? agenda : ["待确认"],
    discussionPoints: discussionPoints.length ? discussionPoints : [text.slice(0, 120)],
    decisions: decisions.length ? decisions : ["待确认：演示模式未从原文识别到明确决策"],
    risks,
    actionItems,
    summary: `演示模式已基于当前输入生成：共识别 ${participants.length || 0} 位参会人、${decisions.length} 条决策、${actionItems.length} 条待办。请核对标记为“待确认”的信息。`
  };
}

function systemPrompt() {
  return `你是会议纪要助手。请只基于用户提供的会议内容生成结构化纪要。
输出必须是 JSON，不要 Markdown。字段为：
participants: string[]
agenda: string[]
discussionPoints: string[]
decisions: string[]
risks: string[]
actionItems: { content: string, owner: string, dueDate: string, priority: "高"|"中"|"低", status: "未开始"|"进行中"|"已完成" }[]
summary: string
如果信息缺失，请写“待确认”，不要编造具体事实。`;
}

async function ensureDb() {
  await mkdir(dataDir, { recursive: true });
  try {
    await stat(dbPath);
  } catch {
    await writeFile(dbPath, JSON.stringify(defaultDb, null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDb();
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  db.provider = normalizeProvider(db.provider);
  if (!Array.isArray(db.meetings)) {
    db.meetings = defaultDb.meetings;
  }
  await writeDb(db);
  return db;
}

async function writeDb(db) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function normalizeProvider(provider = {}) {
  const rawEndpoint = String(provider.chatEndpoint || provider.endpoint || defaultProvider.chatEndpoint);
  const endpoint = /ark\.cn-|\/responses\b|openai/i.test(rawEndpoint) ? defaultProvider.chatEndpoint : rawEndpoint;
  const rawChatModel = String(provider.chatModel || provider.model || defaultProvider.chatModel);
  const chatModel = /^doubao/i.test(rawChatModel) ? defaultProvider.chatModel : rawChatModel;
  const rawTranscribeModel = String(provider.transcribeModel || defaultProvider.transcribeModel);
  const transcribeModel = /^doubao/i.test(rawTranscribeModel) || /Web Speech/i.test(rawTranscribeModel)
    ? defaultProvider.transcribeModel
    : rawTranscribeModel;
  const normalizedChatEndpoint = normalizeChatEndpoint(endpoint);
  return {
    ...defaultProvider,
    chatEndpoint: normalizedChatEndpoint,
    transcribeEndpoint: "",
    chatModel,
    fallbackModels: Array.isArray(provider.fallbackModels)
      ? provider.fallbackModels
      : defaultProvider.fallbackModels,
    transcribeModel,
    apiKey: provider.apiKey || "",
    demoMode: Boolean(provider.demoMode ?? provider.mockMode ?? false),
    updatedAt: provider.updatedAt || ""
  };
}

function normalizeChatEndpoint(endpoint = "") {
  const value = String(endpoint || defaultProvider.chatEndpoint).trim().replace(/\/+$/, "");
  if (!value) return `${dashScopeCompatBase}/chat/completions`;
  if (value.endsWith("/chat/completions")) return value;
  return `${value}/chat/completions`;
}

function maskProvider(provider) {
  return {
    chatEndpoint: provider.chatEndpoint,
    transcribeEndpoint: provider.transcribeEndpoint,
    chatModel: provider.chatModel,
    fallbackModels: provider.fallbackModels,
    transcribeModel: provider.transcribeModel,
    hasApiKey: Boolean(provider.apiKey),
    demoMode: provider.demoMode,
    updatedAt: provider.updatedAt
  };
}

async function readBodyBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = (await readBodyBuffer(req)).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function requireConfigured(provider) {
  if (provider.demoMode) return null;
  if (!provider.apiKey) return "请先在设置页填写千问 API Key。";
  return null;
}

function qwenError(message, code = "QWEN_ERROR", status = 502, requestId = "") {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.requestId = requestId;
  return error;
}

function mapQwenError(status, detail = "", requestId = "") {
  const statusMap = {
    400: ["请求参数或请求体格式错误", "BAD_REQUEST"],
    401: ["API Key 无效", "INVALID_API_KEY"],
    403: ["没有模型访问权限", "MODEL_ACCESS_DENIED"],
    404: ["接口地址或模型名称错误", "MODEL_OR_ENDPOINT_NOT_FOUND"],
    413: ["音频文件过大。当前版本支持5分钟以内的短音频，较长录音需要使用长音频异步转写功能。", "AUDIO_TOO_LARGE"],
    429: ["调用频率过高、额度不足或触发限流", "RATE_LIMITED"],
    500: ["千问服务暂时不可用", "QWEN_UNAVAILABLE"],
    502: ["千问服务暂时不可用", "QWEN_UNAVAILABLE"],
    503: ["千问服务暂时不可用", "QWEN_UNAVAILABLE"]
  };
  const [message, code] = statusMap[status] || [`千问接口返回 ${status}，请稍后重试`, "QWEN_ERROR"];
  const text = String(detail || "");
  const extra = text && status !== 401 ? `：${text.slice(0, 180)}` : "";
  return qwenError(`${message}${extra}`, code, status, requestId);
}

function sendError(res, error, fallbackStatus = 500) {
  return sendJson(res, error.status || fallbackStatus, {
    success: false,
    error: error.message || "请求失败，请稍后重试",
    code: error.code || "INTERNAL_ERROR",
    requestId: error.requestId || ""
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw qwenError("API 请求超过 120 秒未返回，请稍后重试。", "REQUEST_TIMEOUT", 504);
    throw qwenError("网络连接失败，请检查本机网络或千问服务地址。", "NETWORK_ERROR", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function callQwenChat(provider, requestBody) {
  const response = await fetchWithTimeout(provider.chatEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const detail = await response.text();
    const requestId = response.headers.get("x-request-id") || response.headers.get("x-dashscope-request-id") || "";
    throw mapQwenError(response.status, detail, requestId);
  }

  return response.json();
}

async function callQwenText(provider, messages, options = {}) {
  const json = await callQwenChat(provider, {
    model: options.model || provider.chatModel || defaultProvider.chatModel,
    messages,
    temperature: options.temperature ?? 0.2,
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {})
  });
  return json.choices?.[0]?.message?.content || "";
}

function mimeFromExtension(ext) {
  const map = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac"
  };
  return map[ext] || "application/octet-stream";
}

function validateAudioFile(file) {
  if (!file || file.buffer.length === 0) throw qwenError("没有收到音频文件，请先录音或上传音频。", "NO_AUDIO_FILE", 400);
  if (file.buffer.length > maxShortAudioBytes) {
    throw qwenError(
      "音频文件过大。当前版本支持5分钟以内、7 MB以内的短音频。较长录音需要使用长音频异步转写功能。",
      "AUDIO_TOO_LARGE",
      413
    );
  }
  const ext = extname(file.filename || "").toLowerCase();
  const mime = String(file.contentType || "").split(";")[0].trim().toLowerCase();
  if (!allowedAudioExtensions.has(ext) && !allowedAudioMimeTypes.has(mime)) {
    throw qwenError("不支持的音频格式。请上传 MP3、WAV、M4A、AAC、WebM、OGG 或 FLAC。", "UNSUPPORTED_AUDIO_FORMAT", 400);
  }
  return {
    mimeType: allowedAudioMimeTypes.has(mime) ? mime : mimeFromExtension(ext)
  };
}

async function transcribeWithQwen(provider, file) {
  const { mimeType } = validateAudioFile(file);
  const dataUrl = `data:${mimeType};base64,${file.buffer.toString("base64")}`;
  const requestBody = {
    model: provider.transcribeModel || defaultProvider.transcribeModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: dataUrl
            }
          }
        ]
      }
    ],
    stream: false,
    asr_options: {
      enable_itn: true
    }
  };
  const result = await callQwenChat(provider, requestBody);
  const transcript = result?.choices?.[0]?.message?.content?.trim();
  if (!transcript) throw qwenError("千问识别成功但没有返回文字，请确认音频内容清晰。", "EMPTY_TRANSCRIPT", 502);
  return { success: true, transcript, model: requestBody.model };
}

async function generateMinutesWithQwen(provider, transcript) {
  const content = await callQwenText(
    provider,
    [
      {
        role: "system",
        content: "你是专业会议纪要助手，只能根据会议原文生成内容，不得编造原文未提到的信息。请只返回 JSON，不要 Markdown。"
      },
      {
        role: "user",
        content: `请根据以下会议原文生成结构化会议纪要：\n\n${transcript}\n\n返回 JSON 字段：summary, participants, topics, decisions, actionItems, risks。actionItems 每项包含 content, owner, dueDate, priority。缺失信息写“待确认”。`
      }
    ],
    { jsonMode: true }
  );
  return parseMinutes(content, transcript);
}

async function askQwenAssistant(provider, { question, transcript, minutes, history = [] }) {
  const systemPrompt = `你是会议问答助手。

只能依据提供的会议原文和会议纪要回答。
原文没有的信息，明确回答“会议中未提到”。
不得自行编造人员、时间、数字、决定和任务。
回答尽量简洁，并提供对应的原文依据。
请只返回 JSON，格式为 {"answer":"...","citations":["..."]}。`;
  const normalizedHistory = Array.isArray(history)
    ? history
        .filter((item) => ["user", "assistant"].includes(item?.role) && item.content)
        .slice(-10)
        .map((item) => ({ role: item.role, content: String(item.content).slice(0, 2000) }))
    : [];
  const content = await callQwenText(
    provider,
    [
      { role: "system", content: systemPrompt },
      ...normalizedHistory,
      {
        role: "user",
        content: `
会议原文：
${transcript}

会议纪要：
${JSON.stringify(minutes || {})}

问题：
${question}
        `.trim()
      }
    ],
    { jsonMode: true }
  );
  let parsed;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    throw qwenError("AI 助手没有返回合法 JSON，请稍后重试。", "INVALID_ASSISTANT_JSON", 502);
  }
  const citations = Array.isArray(parsed.citations) ? parsed.citations : [];
  const validCitations = citations.filter((item) => typeof item === "string" && item && transcript.includes(item));
  return {
    success: true,
    answer: parsed.answer || "会议中未提到",
    citations: validCitations,
    source: "api"
  };
}

function parseMultipart(buffer, contentType = "") {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) return null;

  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(delimiter);

  while (start !== -1) {
    start += delimiter.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) break;

    const headers = buffer.slice(start, headerEnd).toString("utf8");
    let bodyStart = headerEnd + 4;
    let next = buffer.indexOf(delimiter, bodyStart);
    if (next === -1) break;
    let bodyEnd = next - 2;
    const body = buffer.slice(bodyStart, bodyEnd);
    parts.push({ headers, body });
    start = next;
  }

  const filePart = parts.find((part) => /filename=/i.test(part.headers));
  if (!filePart) return null;

  return {
    filename: filePart.headers.match(/filename="([^"]+)"/i)?.[1] || "audio.webm",
    contentType: filePart.headers.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream",
    buffer: filePart.body
  };
}

function parseMinutes(content, transcript) {
  try {
    const parsed = JSON.parse(extractJson(content));
    const minutes = { ...emptyMinutes(), ...parsed };
    minutes.agenda = Array.isArray(parsed.agenda) ? parsed.agenda : parsed.topics || minutes.agenda;
    minutes.discussionPoints = Array.isArray(parsed.discussionPoints)
      ? parsed.discussionPoints
      : parsed.topics || minutes.discussionPoints;
    minutes.actionItems = (minutes.actionItems || []).map((item) => ({
      id: item.id || crypto.randomUUID(),
      content: item.content || "待确认",
      owner: item.owner || "待确认",
      dueDate: item.dueDate || "待确认",
      priority: ["高", "中", "低"].includes(item.priority) ? item.priority : "中",
      status: ["未开始", "进行中", "已完成"].includes(item.status) ? item.status : "未开始"
    }));
    return minutes;
  } catch {
    throw qwenError("模型没有返回合法 JSON，无法解析会议纪要。请稍后重试。", "INVALID_MINUTES_JSON", 502);
  }
}

function extractJson(content = "") {
  const text = String(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

function answerFromMinutes(question, transcript, minutes) {
  const q = question || "";
  if (q.includes("负责") || q.includes("谁")) {
    const rows = (minutes.actionItems || []).map((item) => `${item.owner}负责${item.content}，截止${item.dueDate}`).join("；");
    return rows || "当前纪要里没有明确负责人。";
  }
  if (q.includes("风险")) return (minutes.risks || []).join("；") || "当前会议没有提到明确风险。";
  if (q.includes("决定") || q.includes("结论")) return (minutes.decisions || []).join("；") || "当前会议没有形成明确决策。";
  return `根据当前会议内容，核心结论是：${minutes.summary || transcript.slice(0, 120)}`;
}

async function handleApi(req, res, pathname) {
  const db = await readDb();

  if (pathname === "/api/settings/provider" && req.method === "GET") {
    return sendJson(res, 200, maskProvider(db.provider));
  }

  if (pathname === "/api/settings/provider" && req.method === "PUT") {
    const body = await readJson(req);
    const normalizedBodyChatEndpoint = normalizeChatEndpoint(body.chatEndpoint);
    if (normalizedBodyChatEndpoint && !/^https:\/\//i.test(normalizedBodyChatEndpoint)) {
      return sendError(res, qwenError("千问 API 基础地址必须是 HTTPS 地址。", "INVALID_ENDPOINT", 400), 400);
    }
    db.provider = normalizeProvider({
      ...db.provider,
      chatEndpoint: body.chatEndpoint === undefined ? db.provider.chatEndpoint : normalizedBodyChatEndpoint,
      transcribeEndpoint: "",
      chatModel: body.chatModel ?? db.provider.chatModel,
      transcribeModel: body.transcribeModel ?? db.provider.transcribeModel,
      apiKey: body.apiKey ? body.apiKey : db.provider.apiKey,
      demoMode: Boolean(body.demoMode),
      updatedAt: new Date().toISOString()
    });
    await writeDb(db);
    return sendJson(res, 200, maskProvider(db.provider));
  }

  if (pathname === "/api/meetings" && req.method === "GET") {
    return sendJson(res, 200, { meetings: db.meetings });
  }

  if (pathname === "/api/meetings" && req.method === "POST") {
    const body = await readJson(req);
    const meeting = buildMeeting({
      title: body.title || "未命名会议",
      transcript: body.transcript || "",
      minutes: body.minutes || emptyMinutes(),
      meetingTime: body.meetingTime
    });
    db.meetings.unshift(meeting);
    await writeDb(db);
    return sendJson(res, 201, { meeting });
  }

  const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
  if (meetingMatch && req.method === "PUT") {
    const id = decodeURIComponent(meetingMatch[1]);
    const body = await readJson(req);
    const index = db.meetings.findIndex((meeting) => meeting.id === id);
    if (index < 0) {
      return sendJson(res, 404, { error: "没有找到这条会议记录。" });
    }
    db.meetings[index] = {
      ...db.meetings[index],
      title: body.title || db.meetings[index].title,
      meetingTime: body.meetingTime || db.meetings[index].meetingTime,
      transcript: body.transcript ?? db.meetings[index].transcript,
      minutes: body.minutes || db.meetings[index].minutes,
      updatedAt: new Date().toISOString()
    };
    await writeDb(db);
    return sendJson(res, 200, { meeting: db.meetings[index] });
  }

  if (meetingMatch && req.method === "DELETE") {
    const id = decodeURIComponent(meetingMatch[1]);
    const before = db.meetings.length;
    db.meetings = db.meetings.filter((meeting) => meeting.id !== id);
    if (db.meetings.length === before) {
      return sendJson(res, 404, { error: "没有找到这条会议记录。" });
    }
    await writeDb(db);
    return sendJson(res, 200, { ok: true, id });
  }

  if (pathname === "/api/transcribe" && req.method === "POST") {
    if (db.provider.demoMode) {
      await readBodyBuffer(req);
      return sendError(res, qwenError("演示模式不会冒充真实语音识别结果，请关闭演示模式并配置千问 API Key 后重试。", "DEMO_TRANSCRIBE_DISABLED", 400), 400);
    }

    const configError = requireConfigured(db.provider);
    if (configError) return sendError(res, qwenError(configError, "MISSING_API_KEY", 400), 400);

    const body = await readBodyBuffer(req);
    const file = parseMultipart(body, req.headers["content-type"]);

    try {
      const result = await transcribeWithQwen(db.provider, file);
      return sendJson(res, 200, { ...result, source: "api" });
    } catch (error) {
      return sendError(res, error, 502);
    }
  }

  if (pathname === "/api/minutes/generate" && req.method === "POST") {
    const body = await readJson(req);
    const transcript = String(body.transcript || "").trim();
    if (!transcript) {
      return sendError(res, qwenError("请先上传音频或输入会议内容", "MISSING_TRANSCRIPT", 400), 400);
    }

    if (db.provider.demoMode) {
      return sendJson(res, 200, { minutes: makeDemoMinutes(transcript), source: "demo" });
    }

    const configError = requireConfigured(db.provider);
    if (configError) return sendError(res, qwenError(configError, "MISSING_API_KEY", 400), 400);

    try {
      const minutes = await generateMinutesWithQwen(db.provider, transcript);
      return sendJson(res, 200, { success: true, minutes, source: "api" });
    } catch (error) {
      return sendError(res, error, 502);
    }
  }

  if (pathname === "/api/minutes/ask" && req.method === "POST") {
    const body = await readJson(req);
    const transcript = String(body.transcript || "").trim();
    const minutes = body.minutes || emptyMinutes();
    const question = String(body.question || "").trim();
    if (!question) return sendError(res, qwenError("请输入要追问的问题。", "MISSING_QUESTION", 400), 400);
    if (!transcript) return sendError(res, qwenError("请先上传音频或输入会议内容", "MISSING_TRANSCRIPT", 400), 400);

    if (db.provider.demoMode) {
      return sendJson(res, 200, {
        success: true,
        answer: answerFromMinutes(body.question, transcript, minutes),
        citations: [],
        source: "demo"
      });
    }

    const configError = requireConfigured(db.provider);
    if (configError) return sendError(res, qwenError(configError, "MISSING_API_KEY", 400), 400);

    try {
      const answer = await askQwenAssistant(db.provider, {
        question,
        transcript,
        minutes,
        history: body.history || []
      });
      return sendJson(res, 200, answer);
    } catch (error) {
      return sendError(res, error, 502);
    }
  }

  return sendError(res, qwenError("接口不存在。", "NOT_FOUND", 404), 404);
}

async function serveStatic(req, res, pathname) {
  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    await stat(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    sendError(res, error, 500);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Meeting Minutes Assistant running at http://127.0.0.1:${port}`);
});

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

const sampleTranscript = `项目组周会，时间为 2026 年 6 月 19 日。参会人包括张敏、李哲、王一凡和陈可。
张敏说明本周完成了登录页改版，下一步要补充移动端适配。李哲反馈语音转文字接口已经跑通，但长音频需要分段上传。
王一凡提出演示文稿还缺少技术路线图和测试截图，建议周日前补齐。陈可提醒访问密钥不能放在前端，需要通过后端代理调用模型。
会议决定本周先完成会议纪要助手的可演示版本，支持粘贴会议文本、生成结构化纪要、追问会议细节和保存历史记录。
待办事项：张敏负责完善页面交互，截止周六；李哲负责接口联调，截止周日；王一凡负责整理课程汇报材料，截止下周一。`;

const defaultProvider = {
  chatEndpoint: "https://ark.cn-beijing.volces.com/api/v3/responses",
  transcribeEndpoint: "",
  chatModel: "doubao-seed-2-0-pro-260215",
  fallbackModels: [],
  transcribeModel: "Web Speech zh-CN",
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
  const transcribeEndpoint = provider.transcribeEndpoint === "浏览器实时识别，无需填写" ? "" : provider.transcribeEndpoint;
  return {
    ...defaultProvider,
    chatEndpoint: provider.chatEndpoint || provider.endpoint || defaultProvider.chatEndpoint,
    transcribeEndpoint: transcribeEndpoint || defaultProvider.transcribeEndpoint,
    chatModel: provider.chatModel || provider.model || defaultProvider.chatModel,
    fallbackModels: Array.isArray(provider.fallbackModels)
      ? provider.fallbackModels
      : defaultProvider.fallbackModels,
    transcribeModel: provider.transcribeModel || defaultProvider.transcribeModel,
    apiKey: provider.apiKey || "",
    demoMode: Boolean(provider.demoMode ?? provider.mockMode ?? false),
    updatedAt: provider.updatedAt || ""
  };
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
  if (!provider.apiKey) {
    return "请先在右侧 API 配置中填写 API Key，或主动开启演示模式。";
  }
  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("API 请求超过 120 秒未返回，请稍后重试或更换更快的模型。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function callChatProvider(provider, messages, jsonMode = true) {
  const models = [...new Set([provider.chatModel, ...(provider.fallbackModels || [])].filter(Boolean))];
  const errors = [];

  for (const model of models) {
    try {
      return await callChatModel(provider, model, messages, jsonMode);
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }

  throw new Error(`所有候选模型都不可用：${errors.join(" | ").slice(0, 900)}`);
}

async function callChatModel(provider, model, messages, jsonMode = true) {
  if (provider.chatEndpoint.includes("/responses")) {
    return callResponsesModel(provider, model, messages);
  }

  const response = await fetchWithTimeout(provider.chatEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {})
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM API ${response.status}: ${detail.slice(0, 400)}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content || "";
}

async function callResponsesModel(provider, model, messages) {
  const prompt = messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join("\n\n");
  const response = await fetchWithTimeout(provider.chatEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }]
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Responses API ${response.status}: ${detail.slice(0, 400)}`);
  }

  const json = await response.json();
  if (json.output_text) return json.output_text;
  if (Array.isArray(json.output)) {
    const parts = [];
    for (const item of json.output) {
      for (const content of item.content || []) {
        if (content.text) parts.push(content.text);
      }
    }
    if (parts.length) return parts.join("\n");
  }
  return JSON.stringify(json);
}

async function callTranscriptionProvider(provider, file) {
  if (!provider.transcribeEndpoint) {
    throw new Error("未配置服务端转写接口。浏览器实时识别请使用“开始录音”，上传音频需要先在设置页配置转写接口。");
  }
  if (!/^https:\/\//i.test(provider.transcribeEndpoint)) {
    throw new Error("转写接口必须是 HTTPS 地址。");
  }
  const form = new FormData();
  const blob = new Blob([file.buffer], { type: file.contentType || "application/octet-stream" });
  form.append("file", blob, file.filename || "meeting.webm");
  form.append("model", provider.transcribeModel);

  const response = await fetchWithTimeout(provider.transcribeEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Transcription API ${response.status}: ${detail.slice(0, 400)}`);
  }

  const json = await response.json();
  return json.text || json.transcript || "";
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
    throw new Error("模型没有返回合法 JSON，请检查 Prompt 或换用支持 JSON 输出的模型。");
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
    if (body.transcribeEndpoint && !/^https:\/\//i.test(body.transcribeEndpoint)) {
      return sendJson(res, 400, { error: "转写接口必须是 HTTPS 地址；如使用浏览器实时识别，请留空。" });
    }
    db.provider = normalizeProvider({
      ...db.provider,
      chatEndpoint: body.chatEndpoint ?? db.provider.chatEndpoint,
      transcribeEndpoint: body.transcribeEndpoint ?? db.provider.transcribeEndpoint,
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
      return sendJson(res, 200, { transcript: sampleTranscript, source: "demo" });
    }

    const configError = requireConfigured(db.provider);
    if (configError) return sendJson(res, 400, { error: configError });

    const body = await readBodyBuffer(req);
    const file = parseMultipart(body, req.headers["content-type"]);
    if (!file || file.buffer.length === 0) {
      return sendJson(res, 400, { error: "没有收到音频文件，请先录音或上传音频。" });
    }

    try {
      const transcript = await callTranscriptionProvider(db.provider, file);
      return sendJson(res, 200, { transcript, source: "api" });
    } catch (error) {
      return sendJson(res, 502, { error: error.message });
    }
  }

  if (pathname === "/api/minutes/generate" && req.method === "POST") {
    const body = await readJson(req);
    const transcript = body.transcript || sampleTranscript;

    if (db.provider.demoMode) {
      return sendJson(res, 200, { minutes: makeDemoMinutes(transcript), source: "demo" });
    }

    const configError = requireConfigured(db.provider);
    if (configError) return sendJson(res, 400, { error: configError });

    try {
      const content = await callChatProvider(db.provider, [
        { role: "system", content: systemPrompt() },
        { role: "user", content: transcript }
      ]);
      return sendJson(res, 200, { minutes: parseMinutes(content, transcript), source: "api" });
    } catch (error) {
      return sendJson(res, 502, { error: error.message });
    }
  }

  if (pathname === "/api/minutes/ask" && req.method === "POST") {
    const body = await readJson(req);
    const transcript = body.transcript || sampleTranscript;
    const minutes = body.minutes || makeDemoMinutes(transcript);

    if (db.provider.demoMode) {
      return sendJson(res, 200, {
        answer: answerFromMinutes(body.question, transcript, minutes),
        citations: [transcript.slice(0, 90)],
        source: "demo"
      });
    }

    const configError = requireConfigured(db.provider);
    if (configError) return sendJson(res, 400, { error: configError });

    try {
      const content = await callChatProvider(db.provider, [
        { role: "system", content: "你是会议纪要问答助手。只能依据会议原文和结构化纪要回答，缺失信息请说待确认。输出 JSON：{\"answer\":\"...\",\"citations\":[\"...\"]}" },
        { role: "user", content: JSON.stringify({ question: body.question, transcript, minutes }) }
      ]);
      return sendJson(res, 200, { ...JSON.parse(content), source: "api" });
    } catch (error) {
      return sendJson(res, 502, { error: error.message });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
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
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Meeting Minutes Assistant running at http://127.0.0.1:${port}`);
});

# 基于 AI 的会议纪要助手

课程场景：场景 A，会议纪要助手。当前实现是一个本地可运行的全栈网页应用，采用“左侧会议来源 + 中心纪要工作台 + 右侧 AI 助手”的办公工具布局。

## 功能

- 输入会议文字、上传音频/视频或使用浏览器录音。
- 使用浏览器 `Web Speech zh-CN` 做实时语音转文字；上传音频接口保留后端转写扩展点。
- 调用真实豆包/火山方舟 Responses API 生成结构化纪要。
- 展示摘要、参会人、议题、讨论要点、决策结论、风险提示和可编辑待办表格。
- 支持 AI 追问会议细节，并返回引用依据。
- 支持历史会议保存、打开、再次追问。
- 支持模板、知识库、设置、分享、导出 Markdown、搜索、撤销/重做等操作。
- API Key 保存在本地服务端 `data/db.json`，前端只显示是否已配置，不会直接拿到密钥。

## 运行

```bash
node server.mjs
```

打开：

```text
http://127.0.0.1:4173
```

## 当前模型配置

- Endpoint: `https://ark.cn-beijing.volces.com/api/v3/responses`
- 模型：`doubao-seed-2-0-pro-260215`
- 模式：真实 API，演示模式默认关闭
- 语音转文字：浏览器 `Web Speech zh-CN`

如果要替换模型，在右侧“模型设置”里修改 Endpoint、模型名和 API Key 后保存即可。

## API

- `POST /api/transcribe`
- `POST /api/minutes/generate`
- `POST /api/minutes/ask`
- `GET /api/meetings`
- `POST /api/meetings`
- `GET /api/settings/provider`
- `PUT /api/settings/provider`

## 技术说明

当前环境没有可用 npm 安装流程，所以项目实现为无第三方依赖的 Node.js 全栈网页应用。后续如果迁移到正式商用版本，建议升级为 Next.js / 数据库 / 登录权限 / 审计日志 / 企业级密钥管理。

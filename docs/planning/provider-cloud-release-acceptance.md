# DeepStorming 真实云 Provider 与发布前验收清单

- 日期：2026-07-14
- 范围：DeepSeek Provider、OpenAI-compatible Provider、Provider-backed Lesson reply/retry、发布前安全与包体检查。
- 目的：在用户本地手动验证真实云模型，不把真实凭据写入仓库、日志、SQLite 明文、fixtures、screenshots 或报告。

## 1. 依据

- DeepSeek 官方文档说明其 API 使用兼容 OpenAI 的格式，OpenAI base URL 为 `https://api.deepseek.com`，Chat API 示例调用 `/chat/completions`；文档还显示旧 `deepseek-chat` / `deepseek-reasoner` 名称将在 2026-07-24 15:59 UTC 废弃，建议后续手动验收优先使用 `deepseek-v4-flash` 或 `deepseek-v4-pro`。来源：[DeepSeek API Docs](https://api-docs.deepseek.com/)。
- OpenAI API Reference 仍列出 Chat Completions，并说明 `POST /chat/completions` 基于 messages 返回模型响应。来源：[OpenAI API Reference - Chat](https://platform.openai.com/docs/api-reference/chat)。
- 当前代码使用 OpenAI-compatible 非流式 Chat Completions：`POST {baseUrl}/chat/completions`、`Authorization: Bearer ...`、`stream:false`，并只解析首个 assistant message content。

## 2. 安全原则

1. 真实 API Key 只允许通过应用 UI 输入。
2. 不把 API Key 粘贴到终端命令、测试文件、日志、截图、录屏、issue、PR 描述或 Markdown 文档。
3. 手动验收记录只写稳定结果：Provider 类型、模型名、成功/失败状态、稳定错误码、是否可重试。
4. 不记录 Authorization header、原始请求体、原始响应正文、完整 prompt、完整文档正文或用户私密学习内容。
5. 验收结束后如需共享报告，先运行敏感信息扫描。

## 3. 测试前准备

- 确认本地工作区干净：`git status --short` 无输出。
- 确认自动化门禁通过：

```bash
pnpm check
pnpm test:e2e
```

- 使用临时 Electron `userData` 或新建应用数据目录，避免污染真实学习记录。
- 准备一段非敏感测试文本，例如：

```text
Evidence links a claim to observable behavior. A learner should explain what the evidence proves and what it does not prove.
```

## 4. DeepSeek 手动验收矩阵

| 编号 | 场景          | 操作                                                                           | 期望                                                                 |
| ---- | ------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| D-01 | 创建 Provider | 类型选 DeepSeek，模型填 `deepseek-v4-flash` 或当前官方推荐模型，输入真实 Key。 | 创建成功；列表只显示 `hasApiKey` 语义，不显示 Key 或 `secret_ref`。  |
| D-02 | 启用 Provider | 点击启用。                                                                     | 只有该 Provider 为 active。                                          |
| D-03 | 连接测试成功  | 点击连接测试。                                                                 | 状态从 `testing` 到 `success`；无 Authorization/响应正文出现在日志。 |
| D-04 | 课堂生成      | 导入测试文本，启动课堂，提交学习者回答。                                       | Tutor follow-up 来自 Provider；model run 写入 providerId/modelName。 |
| D-05 | 取消生成      | 使用延迟网络或较慢模型时点击取消生成。                                         | run 保存为 `cancelled`，`errorSummary.code=OPERATION_CANCELLED`。    |
| D-06 | 重试生成      | 对 failed/cancelled run 点击重试。                                             | 原 run 保留，新 run 追加；成功后追加 tutor message。                 |
| D-07 | 错误 Key      | 编辑为错误 Key 后测试连接。                                                    | 显示认证失败稳定错误；不保存原始 Provider 响应。                     |
| D-08 | 错误模型      | 填不存在模型后测试连接。                                                       | 映射为模型不存在稳定错误，状态进入 error。                           |
| D-09 | 重启持久化    | 关闭并重启应用。                                                               | Provider 元数据、active 状态、课堂消息和 run 历史仍可读取。          |

## 4.1 DeepSeek 手动验收记录（2026-07-14）

- App commit：`8c2b5ea`
- macOS 版本：本地 macOS（arm64）
- Provider 类型：deepseek
- Base URL：`https://api.deepseek.com`
- 模型名：`deepseek-v4-flash`
- API Key 是否只通过批准的本地方式输入：是
- 连接测试：success
- 课堂生成：success
- 重启后是否可恢复：是
- 敏感信息扫描是否通过：passed
- 备注：
  - 验收使用临时本地 `userData` 目录。
  - 未在文档、仓库文件、终端输出中记录真实 API Key、Authorization header、原始响应正文或完整 prompt。
  - 本轮未额外执行错误 Key / 错误模型破坏性验证，避免对真实 key 流程引入不必要风险。

## 4.2 DeepSeek opt-in 自动验收入口

常规 `pnpm test:e2e` 永远不会访问真实 DeepSeek。需要复验时，显式提供只含 Key 的本地文件和当次要验证的模型名：

```bash
DEEPSTORMING_REAL_DEEPSEEK_KEY_FILE=/absolute/private/path/deepseek_api.txt \
DEEPSTORMING_REAL_DEEPSEEK_MODEL=your-current-model \
pnpm test:e2e:deepseek
```

该入口执行创建、启用、连接测试、真实首问、真实追问和重启恢复。Key 由测试进程从指定文件读取后填写到应用密码框，随后沿正式 Provider use case 和 Secret Vault 保存；不会作为命令参数、环境变量值或数据库字段传递。

专用 Playwright 配置关闭 trace、截图、视频、HTML 报告和失败产物保留。测试使用临时 `userData` 并在结束后删除。运行者仍不得把 Key 文件放入仓库，也不得在失败时添加打印 Key 的临时诊断。

## 5. OpenAI-compatible 手动验收矩阵

| 编号 | 场景              | 操作                                            | 期望                                             |
| ---- | ----------------- | ----------------------------------------------- | ------------------------------------------------ |
| O-01 | HTTPS Base URL    | 输入兼容服务 HTTPS Base URL 和模型名。          | 保存前规范化结尾斜杠和 `/chat/completions`。     |
| O-02 | 拒绝不安全地址    | 输入远程 `http://` Base URL。                   | UI 或用例拒绝；不保存 Provider。                 |
| O-03 | 连接测试成功      | 使用真实 Key 测试连接。                         | 成功状态持久化。                                 |
| O-04 | 课堂生成          | 启用该 Provider 后提交课堂回答。                | Tutor follow-up 写入消息；run 记录模型名。       |
| O-05 | 取消              | pending 期间点击取消。                          | Gateway 收到 token abort；run 保存为 cancelled。 |
| O-06 | 429 / quota / 401 | 使用测试账户或服务端配置触发稳定 HTTP 错误。    | 显示稳定错误码，不泄露响应正文。                 |
| O-07 | 空 choices        | 使用本地兼容测试服务返回缺失/空 `choices`。     | 映射 `PROVIDER_RESPONSE_INVALID`。               |
| O-08 | 重启              | 重启后读取 Provider、课堂、生成记录和错误摘要。 | 所有持久化状态一致。                             |

当前状态：OpenAI-compatible 真实端点手动验收仍待后续有明确需求时补做。本轮 D1 已先完成 DeepSeek 真实 Provider 验收。

### 5.1 OpenAI-compatible 恢复执行说明

当前这部分保持为“待真实验收”，不是实现失败，也不是已经完成。后续只有在补齐真实 `HTTPS base URL + model + API key` 后，才进入手动验收执行。

建议固定按以下顺序恢复：

1. 先执行 O-01 ~ O-03，确认地址规范化、安全约束与连接测试成功。
2. 再执行 O-04 ~ O-05，确认课堂生成主链路与取消语义。
3. 最后执行 O-06 ~ O-08，确认稳定错误映射、无效响应处理与重启恢复。

完成定义：

- 没有真实 HTTPS 端点时，不把 OpenAI-compatible 标记为完成。
- 只完成连接测试，不算完成。
- 至少完成：连接成功、课堂生成成功、取消成功、至少一种稳定错误映射验证、重启恢复成功。
- 完成后必须补齐手动验收记录，并通过本文件第 8 节的敏感信息扫描建议。

边界说明：

> 在没有真实兼容端点的前提下，现阶段只做验收设计与记录准备，不以 mock、单测或文档推断替代真实验收结论。

## 6. 发布前清单

### 6.1 包体与原生模块

- [x] `pnpm package:dir` 成功。
- [x] `apps/desktop/release/mac-arm64/DeepStorming.app` 可启动。
- [x] `better_sqlite3.node` 位于 `app.asar.unpacked`，并通过打包应用重启持久化测试完成 Electron runtime 读写。
- [x] 打包脚本与 E2E 脚本结束后恢复 Node ABI；最终 `pnpm check` 已通过。

### 6.2 品牌与 macOS 发布

- 替换 Electron 默认图标。
- 设置应用名称、bundle id、版本号和版权信息。
- Developer ID Application 签名。
- Notarization 成功。
- Gatekeeper 首次打开不报未知开发者阻断。
- 生成用户可下载的 zip 或 DMG。

### 6.2A 自用版发布候选（当前已推进到这一层）

- 允许未签名、未公证的本地目录包用于个人设备自用。
- 明确记录 Gatekeeper / 未知开发者提示是当前自用版限制，而不是功能性失败。
- 要求可本地重装、可备份、可恢复。
- 继续把签名、公证和公开分发保留为后续工作。

### 6.3 隐私与数据说明

发布前必须有用户可读说明：

- 文档、SQLite、Vault 默认存本地。
- 使用云 Provider 时，选中的证据片段和学习者回答会发送给用户启用的 Provider。
- API Key 使用系统安全能力加密保存，Renderer 不读取明文 Key。
- 删除 Provider 会删除可清理的 Vault 引用。
- 删除文档会删除文档正文与派生数据；课堂审计中已保存的 snippet 需要按后续隐私设计决定是否保留或脱敏。

### 6.4 数据备份与升级

- 新安装通过。
- 覆盖升级通过。
- 旧数据库迁移到最新 schema 成功。
- migration checksum mismatch 会安全失败。
- 非空数据库 pending migration 前会备份。
- 备份恢复演练成功。

## 7. 手动验收记录模板

```markdown
## Provider 手动验收记录

- 日期：
- App commit：
- macOS 版本：
- Provider 类型：
- Base URL：
- 模型名：
- API Key 是否只通过 UI 输入：是/否
- 连接测试：success/error/cancelled
- 课堂生成：success/error/cancelled
- 失败稳定错误码：
- 重启后是否可恢复：是/否
- 敏感信息扫描是否通过：是/否
- 备注：
```

## 8. 敏感信息扫描建议

手动验收后运行：

```bash
rg -n "Authorization|Bearer |sk-|DEEPSEEK_API_KEY|OPENAI_API_KEY|api[_-]?key|secret_ref" \
  apps packages tests docs README.md
```

允许命中：

- 文档中的安全说明文字。
- 测试中明确的假数据名称。

不允许命中：

- 真实 Key。
- 真实 Authorization header。
- 真实 Provider 原始响应正文。
- SQLite 明文密钥或 Vault 密文文件内容。

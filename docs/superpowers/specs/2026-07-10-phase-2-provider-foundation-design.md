# DeepStorming Phase 1 收尾与 Phase 2 Provider 基线设计

- 日期：2026-07-10
- 状态：已获用户确认
- 范围：关闭 Phase 1 macOS 验收缺口，完成 Phase 2 SQLite、Migration、Secret Vault 与 Provider 垂直切片
- 进度来源：[项目推进对话](https://chatgpt.com/share/6a509123-2460-83ea-99a0-d40f453b4f97)

## 1. 背景与目标

DeepStorming 已完成 Phase 0–1 的工程骨架、Electron 安全边界、类型安全 IPC、基础测试和打包配置。macOS 实机验证暴露了一个尚未关闭的门禁：E2E 直接启动 Electron 入口时，`app.getVersion()` 返回 Electron 运行时版本 `43.1.0`，而不是 DeepStorming 应用版本 `0.0.0`。

本阶段先修正应用版本来源并关闭 Phase 1 门禁，然后交付首个完整业务纵向切片：用户可以安全地创建、编辑、删除、启用和测试 AI Provider。该切片同时验证 SQLite 原生依赖、数据库迁移、安全密钥存储和打包应用中的持久化能力。

本阶段不实现 PDF 导入、文档库、正式课堂、Embedding、完整流式对话或账号同步。

## 2. 实施策略

采用逐段过门禁的纵向切片：

1. 修复应用版本来源并通过 Phase 1 E2E。
2. 完成 SQLite Binding 技术 Spike、迁移器和 Provider Repository。
3. 完成 Secret Vault 及密钥写入补偿逻辑。
4. 使用 Mock Provider 打通 Application、IPC、Preload 和 Renderer。
5. 接入 DeepSeek 与 OpenAI-compatible HTTP Adapter。
6. 完成 Provider 管理 E2E、打包验证和敏感信息扫描。

不采用“基础设施全部完成后再集成”或“先做临时 UI 再接持久化”的方式，以避免把集成风险集中到阶段末尾或长期保留临时状态模型。

## 3. 架构边界

### 3.1 Domain

Domain 定义 Provider 配置、Provider 类型、能力声明、连接测试状态和值对象校验规则。它不依赖 Electron、SQLite、React、网络库或第三方 Provider SDK。

核心规则包括：

- Provider 类型仅允许 `mock`、`deepseek` 和 `openai_compatible`。
- Mock Provider 不需要 API Key；云 Provider 必须具有可用的密钥引用才能启用或测试。
- 显示名称和模型名不能为空。
- OpenAI-compatible Provider 必须具有合法的 HTTPS Base URL。
- 任意时刻最多一个 Provider 处于启用状态。
- 掩码字符串不是有效密钥输入。

### 3.2 Application

Application 声明以下 Ports：

- `ProviderRepositoryPort`：Provider 元数据的查询与事务写入。
- `SecretVaultPort`：密钥的写入、读取与删除。
- `SecretCleanupReporterPort`：仅记录待对账的 `secretRef` 和稳定错误码；实现不得抛错，也不得接收原始密钥或底层异常。
- `ProviderGatewayPort`：最小连接测试和能力查询。
- `ProviderGatewayFactoryPort`：根据 Provider 类型创建对应 Gateway。

Application 提供列表、新增、编辑、删除、启用、测试连接和取消测试用例。用例负责业务顺序、幂等性和补偿；不暴露 SQLite 行、Electron 对象、加密 Buffer 或厂商响应类型。

### 3.3 Infrastructure

Infrastructure 实现：

- SQLite 连接工厂、迁移器和 Provider Repository。
- 基于 Electron `safeStorage` 的加密文件 Vault。
- Mock、DeepSeek 和 OpenAI-compatible Provider Gateway。
- Provider HTTP 状态、网络异常和响应格式的稳定错误映射。

Provider 请求使用平台 HTTP 能力和显式超时，不引入厂商 SDK。这样可以减少 Renderer 暴露面，并使 DeepSeek 与 OpenAI-compatible 共用经过测试的协议实现。

### 3.4 Desktop Main、Preload 与 Renderer

Main Process 是唯一组合根。每个 IPC Handler 只做请求校验、调用一个用例和错误映射。数据库、Vault、HTTP Client 和运行中测试的取消控制器不进入 Renderer。

Preload 只暴露细粒度 Provider API，不暴露通用 `invoke`。Renderer 仅依赖 Contracts 和 UI 模块，只能读取 `hasApiKey: boolean`，不能读取 `secret_ref`、密文、明文 Key 或 Authorization Header。

## 4. 数据设计与迁移

Phase 2 首批迁移创建：

- `schema_migrations`
- `app_settings`
- `ai_providers`
- `provider_write_requests`
- `provider_test_operations`

字段和约束遵循 `docs/database/database_schema.md`。`ai_providers` 使用部分唯一索引保证最多一个 `is_active = 1`。`capabilities_json` 在 Repository 边界进行运行时校验，不把未校验 JSON 传入 Domain。

`provider_write_requests` 以 `request_id` 为主键，仅保存 `create/update/delete/activate` 的操作类型、非空 `target_provider_id`、逻辑结果状态、包含内部 `revision` 和可选 `secret_ref` 但不包含原始密钥的 Provider/删除结果快照和创建时间。目标身份独立于可空结果快照。每个 Provider 写事务必须同时提交业务变更和不可变的完成结果；相同 request ID 仅在操作与目标 Provider ID 都匹配时返回原始逻辑结果，不重复应用写入，否则返回 `PROVIDER_VALIDATION_FAILED`。若不同操作在预检后赢得并发事务，Repository 返回显式 `conflict` 结果，用例只补偿本次新建且未被采用的 Vault 引用。

Provider 创建时内部 `revision = 1`。更新使用单条 `UPDATE ... WHERE id = ? AND revision = ?` 执行真实 CAS，并依据受影响行数区分成功及后续的 `stale/not_found`；`updated_at` 仅用于展示和审计。启用在 SQLite immediate 写事务内读取并比较 revision、重新确认目标仍为 Mock 或具有 `secret_ref`，再原子清除旧启用项和切换目标，避免并发事务读到相同 revision 后部分提交。公共 `ProviderProfile` 不暴露 revision。连接测试不写入不可变 request outcome；Task 6 建立 `provider_test_operations`，使用独立 `operation_id` 对 `last_test_status` 执行 `testing -> terminal` 的持久化比较并交换转换，并保存每次成功转换产生的严格校验 Provider 快照；重放先读取操作历史并返回该原始快照，即使当前 Provider 已编辑或删除。Task 8 在此基础上实现外部请求编排与取消。

迁移规则：

- 版本单调递增，单个迁移在事务中执行。
- 已应用迁移保存名称、校验和与执行时间。
- 已应用文件的校验和不一致时停止启动，并返回 `DATABASE_MIGRATION_FAILED`，不得静默覆盖。
- 重复启动对已完成迁移无副作用。
- 非空数据库存在待执行迁移时，在创建或修改 `schema_migrations` 等任何 Schema 之前完成一致性备份；备份失败不得改变原数据库 Schema 或数据。
- 连接启用 WAL、外键、事务和 busy timeout。
- 数据库位于 Electron `userData` 路径；测试使用独立临时目录。

SQLite Spike 首选 `better-sqlite3`，因为 Repository 需要同步事务和可预测的迁移边界。只有在开发构建、Vitest 集成测试、macOS 目录包和打包应用读写验证全部通过后才锁定该依赖；如果原生模块重建或打包验证失败，本阶段停止并记录证据，不在同一实现中静默切换 Binding。

## 5. Secret Vault 与一致性

Vault 使用 Electron `safeStorage` 加密字符串。密文写入 `userData` 下专用 Vault 目录，文件名为不可推断内容的随机引用。文件采用临时文件写入后原子重命名，SQLite 只保存 `secret_ref`。

写入顺序如下：

### 5.1 新增 Provider

1. 校验输入并拒绝掩码值。
2. 如需密钥，先写入 Vault。
3. 在数据库事务中写入 Provider 元数据和 `secret_ref`。
4. 同一事务保存 request ID 的不可变逻辑结果；并发重放返回原始快照和显式 `replayed` 状态。
5. 数据库写入失败或并发重放未采用新引用时删除新密钥；补偿失败只记录引用和稳定错误码，不记录密钥内容。

### 5.2 编辑 Provider

- Key 字段缺省或为空表示保留原密钥。
- 替换时先写新密钥，再事务更新 `secret_ref`，最后删除旧密钥。
- 新密钥写入或数据库更新失败时，旧引用保持有效。
- 掩码字符串始终被视为非法输入，而不是“保留原值”的特殊标记。
- 同类型 Provider 的空 Key 保留旧引用；切换到 Mock 清除引用，且忽略传给 Mock 的新 Key。
- 从一种云 Provider 类型切换到另一种云 Provider 类型必须提供新 Key，不能复用旧身份凭据。
- 未启用的 Mock 可以无 Key 切换并保存为云 Provider；已启用的 Mock 无 Key 切换到云 Provider 必须拒绝且保持旧行。
- 仅修改显示名称时保留最近测试状态；Provider 类型、规范化 Base URL、模型名或有效密钥引用变化时清除测试状态和时间。
- 数据库已成功更新但旧密钥删除失败时，通过不抛错的清理报告 Port 记录 `{secretRef, code: 'SECRET_DELETE_FAILED'}` 并仍返回更新成功；启动对账负责重试孤儿引用。

### 5.3 删除 Provider

1. 在一个数据库事务中检查阻止引用并按 request ID 删除 Provider、保存逻辑结果。
2. 原子操作返回 `removed`、`blocked` 或 `not_found`，重放返回原始结果而不再次删除。
3. 删除对应 Vault 项。
4. Vault 清理失败时仅报告稳定的待对账引用并仍返回删除成功；不得恢复出一个元数据已删除但仍可被应用使用的 Provider。

Phase 2 尚无课堂引用，但删除检查接口现在建立，以便后续扩展时不改变用例边界。

应用启动时执行 Vault 对账：以数据库中仍被引用的 `secret_ref` 为准，重试删除未被引用的加密文件。这覆盖“Vault 写入成功但数据库写入失败”和“数据库更新成功但旧密钥清理失败”的崩溃窗口。对账只处理 Vault 自己管理的随机引用，不扫描或删除其他应用文件。

## 6. Provider 行为

### 6.1 Mock Provider

Mock Provider 无需网络和 API Key，提供确定性的成功、认证失败、限流、模型不存在、格式错误和延迟场景，用于业务测试与 E2E。

### 6.2 DeepSeek

DeepSeek 默认使用 `https://api.deepseek.com`，用户配置模型名和 API Key。连接测试执行最小 Chat Completions 请求，不把响应正文写入日志。

### 6.3 OpenAI-compatible

用户配置 HTTPS Base URL、模型名和 API Key。Base URL 在保存前规范化，禁止非 HTTPS 远程地址；仅测试环境允许回环 HTTP 地址，以便使用本地测试服务器进行集成测试。

### 6.4 连接测试与取消

连接测试具有唯一 operation ID。Renderer 发起测试后进入 `loading`，Main 在发出外部请求前保存最近测试状态。独立取消 IPC 通过 operation ID 中止对应请求。

最终状态必须是：

- `success`
- `error`
- `cancelled`

请求具有固定超时。窗口关闭或应用退出时中止仍在运行的测试。重复取消为幂等操作。

## 7. 错误模型

Contracts 扩展稳定错误码，至少包含：

- `DATABASE_UNAVAILABLE`
- `DATABASE_MIGRATION_FAILED`
- `PROVIDER_NOT_FOUND`
- `PROVIDER_VALIDATION_FAILED`
- `PROVIDER_AUTH_FAILED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_QUOTA_EXCEEDED`
- `PROVIDER_MODEL_NOT_FOUND`
- `PROVIDER_NETWORK_ERROR`
- `PROVIDER_TIMEOUT`
- `PROVIDER_RESPONSE_INVALID`
- `SECRET_VAULT_UNAVAILABLE`
- `SECRET_WRITE_FAILED`
- `SECRET_DELETE_FAILED`
- `OPERATION_CANCELLED`

用户消息必须安全且可操作。`details` 只能包含状态码、字段名、operation ID 等非敏感诊断，不包含 API Key、Authorization Header、完整请求体、完整响应体或底层异常堆栈。

## 8. Renderer 体验

首次启动且没有 Provider 时显示 Provider 配置引导。已有 Provider 时显示管理列表。

界面支持：

- 新增、编辑和删除 Provider。
- 启用一个 Provider。
- 测试连接和取消测试。
- 展示类型、模型、启用状态、`hasApiKey` 和最近测试结果。
- 对所有异步动作展示 loading、success、error；连接测试额外展示 cancelled。

编辑表单中的 Key 输入始终为空，并显示“留空则保留原密钥”。删除和替换密钥具有明确反馈。颜色不是状态的唯一表达方式。

本阶段不引入完整路由系统或通用设计系统；组件保持小而明确，为后续文档库首页保留替换入口。

## 9. Phase 1 修复

DeepStorming 的应用版本必须来自项目版本元数据，而不是直接启动开发入口时 Electron 二进制的版本。Electron Vite 配置从根 `package.json` 读取版本并生成构建期常量；Main 规范化该常量，并显式注入 `ElectronAppInfoAdapter`。Electron 仅提供 `app.getVersion()`，不提供版本 setter，因此 Adapter 不再依赖开发入口返回的 Electron 二进制版本。Adapter 单元测试与 E2E 同时验证 `0.0.0`，并保留 `darwin` 平台显示。

修复后重新执行 `pnpm check` 和 `pnpm test:e2e`，再进入 SQLite 实施。

## 10. 测试与验收

### 10.1 自动化测试

- Domain：Provider 类型、输入校验、启用规则和掩码拒绝。
- Application：CRUD、空 Key 保留、替换失败回滚、删除清理、取消幂等。
- SQLite：空库迁移、重复迁移、校验和冲突、外键、事务、busy timeout 和唯一启用约束。
- Vault：原子写入、读取、删除、替换补偿和脱敏日志。
- Provider：本地 HTTP 测试服务器覆盖认证、限流、配额、模型不存在、超时、取消和非法响应。
- IPC：非法请求、稳定错误响应和敏感字段不外泄。
- Renderer/E2E：Mock Provider 新增、编辑、启用、测试、取消和删除。

### 10.2 阶段命令

以下命令必须通过：

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
```

还需对 Renderer 状态、SQLite、Vault 目录、日志、测试夹具和快照执行测试 Key 明文扫描。打包后的 macOS 应用必须能够完成 Mock Provider 持久化，并在重启后读取配置。

## 11. 文档交付

实现期间同步维护：

- `docs/planning/current-status.md`：当前阶段、已完成项、门禁结果、已知问题、下一步和常用命令。
- SQLite Binding 与 Secret Vault ADR：记录技术选型、打包验证和拒绝方案。
- Phase 2 实施计划：按可独立验证的任务拆分。
- Phase 2 验收报告：记录测试证据、打包结果和剩余限制。

`current-status.md` 是后续会话恢复上下文的首要入口，必须随着阶段状态变化更新，不能只在阶段结束时补写。

## 12. 完成标准

本阶段只有在以下条件同时满足时完成：

1. Phase 1 应用版本 E2E 在 macOS 通过。
2. SQLite Binding 在开发与目录包中可稳定读写。
3. 空库和已有版本数据库迁移通过。
4. Provider CRUD、启用、测试和取消端到端通过。
5. API Key 不以明文进入 Renderer、SQLite、日志、夹具或快照。
6. 密钥替换失败不会破坏旧密钥。
7. Mock Provider 可在无网络环境工作。
8. DeepSeek 与 OpenAI-compatible 错误被映射为稳定、安全的错误码。
9. `pnpm check`、`pnpm test:e2e` 和 `pnpm package:dir` 全部通过。
10. 项目状态、关键决策和下一步已写入仓库文档。

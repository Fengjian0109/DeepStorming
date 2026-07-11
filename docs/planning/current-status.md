# DeepStorming 当前开发状态

- 更新时间：2026-07-11
- 当前分支：`main`
- 当前阶段：Phase 3 文本文档库
- 状态：Phase 3 最小文档库切片已完成

## 已完成

- Phase 0：需求、架构、数据库与开发计划基线。
- Phase 1：Electron 工程骨架、安全边界、类型安全 IPC 和基础打包。
- Phase 1 应用版本边界：Main 构建时注入根包版本，开发入口正确显示 DeepStorming 版本。
- macOS E2E：`pnpm test:e2e` 通过。
- Phase 2 设计：`docs/superpowers/specs/2026-07-10-phase-2-provider-foundation-design.md`。
- Phase 2 Provider 应用层：CRUD、激活、稳定错误映射与 Secret Vault 补偿顺序。
- Phase 2 SQLite Spike（2026-07-10T13:21:52Z）：`better-sqlite3@12.11.1` 与 `@types/better-sqlite3@7.6.13` 已锁定；Migration 1 创建 `app_settings`、`ai_providers`、`provider_write_requests` 和 `provider_test_operations`，包含 checksum、事务回滚和非空旧库升级前备份。
- Provider Repository：CRUD、revision CAS、唯一激活、原子引用检查删除、不可变写结果重放、JSON 运行时校验、Secret Ref 对账集合与连接测试状态转换均已持久化。
- 加密文件 Secret Vault：Electron safeStorage 窄适配器、0600 密文原子写入、严格 UUID 引用校验、幂等删除、启动孤儿与崩溃临时文件对账，以及非抛出清理失败报告器。
- Provider 连接测试与取消：应用层持久化 `testing/success/error/cancelled`，实现操作取消注册表、Mock 网关、OpenAI-compatible Chat Completions 网关和 Provider Gateway Factory；云 Provider 从 Vault 读取密钥，Mock 不读取 Vault。
- Provider 安全 IPC 与组合根：Main 进程打开并迁移 SQLite、初始化 Secret Vault、启动时对账 Secret refs、共享连接测试取消注册表，并通过显式 IPC/Preload API 暴露 Provider 管理能力。
- Provider 管理 UI：Renderer 仅依赖 Contracts 与本地 UI，支持创建、编辑、启用、删除确认、连接测试与取消；API Key 保持在表单本地状态，编辑时空 Key 表示保留原密钥。
- Provider E2E 与目录包持久化证明：开发版 E2E 使用临时 Electron `userData` 覆盖版本、安全 WebPreferences、Mock Provider 创建/启用/测试/编辑空 Key/延迟取消/删除/回到空状态；macOS 目录包 E2E 启动同一个临时 `userData` 两次，验证 Mock Provider 重启后仍可读取。
- Phase 2 ADR 与验收报告：`docs/adr/0006-sqlite-binding.md`、`docs/adr/0007-secret-vault.md` 与 `docs/planning/phase-2-acceptance-report.md` 已记录 SQLite Binding、Secret Vault、安全扫描、打包证据和 Phase 3 入口。
- Phase 3 文本文档库最小切片：
  - Domain：文档草稿规范化、字符计数、稳定 hash 输入与 `LearningDocument` 模型。
  - Contracts：文档 IPC channels、严格请求/响应 schema、文档业务错误码。
  - Application：文档列表、创建、详情、删除用例与稳定错误映射。
  - Infrastructure：Migration 2 `document_text_import`，落地 `learning_documents` 与 `document_text_versions`，并用 SHA-256 按正文内容做重复检测。
  - Main / Preload：显式文档 IPC、`window.deepstorming.documents` typed API，以及 IPC reject 时的稳定结果回退。
  - Renderer：默认首页切到文档库，支持粘贴文本、新建、`.txt/.md` 导入、详情查看、删除确认、失败保留草稿和稳定错误提示。
  - E2E：新增文档创建/导入/删除/重启持久化覆盖，并修复 `test:e2e` 中 `better-sqlite3` 原生模块增量构建目录损坏导致的重建噪音。

## Phase 3 当前范围与非目标

- 已完成范围：本地纯文本文档库、文本导入、列表/详情/删除、SQLite 持久化、开发版重启持久化验证。
- 非目标：PDF/OCR、页面块结构化解析、全文搜索、chunking、embeddings、课堂消费链路、论文消费链路、后台导入任务。

## 当前门禁

1. `pnpm check`：通过；Prettier、全 workspace typecheck、31 个测试文件 / 372 个测试，以及桌面端构建全部通过。
2. `pnpm test:e2e`：通过；开发版 Provider lifecycle 和文档重启持久化 2 个 E2E 通过，packaged persistence 测试在未先执行 `pnpm package:dir` 时按说明跳过；脚本在 Playwright 前重建 Electron ABI，并在结束后恢复 Node ABI。
3. `pnpm package:dir`：通过；Electron 43.1.0 为 arm64 重建原生模块，目录包位于 `apps/desktop/release/mac-arm64/DeepStorming.app`。
4. `pnpm exec playwright test tests/e2e/packaged-provider.spec.ts`：通过；同一临时 `userData` 下，打包 App 第一次创建 `Packaged Tutor`/`mock-success`，第二次启动仍显示该 Provider 与模型名。
5. 原生模块证据：`Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node` 为 Mach-O 64-bit arm64 bundle；使用该目录包的 Electron runtime 从 `app.asar` 加载模块并完成临时 SQLite 的 create/insert/select，输出 `{"value":"ok"}`。
6. `electron-builder` 会在共享 pnpm workspace 中将原生模块切换为 Electron ABI；跨平台 Node 打包脚本和 E2E 脚本均在 `finally` 中确定性执行 Node ABI 重建（包括打包或测试失败时，并保留原失败退出码），避免打包/E2E 后 Vitest/开发运行失效。

## 已知问题

- 目录包未签名并使用 Electron 默认图标；这不影响本次 SQLite 原生模块门禁，发布前仍需签名与品牌资源。

## 常用命令

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
```

## 下一步

进入 Phase 4/后续串联：让课堂与论文阅读流程消费文档库，并在发布前补签名、图标、公证和真实云 Provider 手动验收清单。

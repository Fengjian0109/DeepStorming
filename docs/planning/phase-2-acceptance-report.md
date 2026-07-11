# DeepStorming Phase 2 Provider Foundation 验收报告

- 日期：2026-07-11
- 仓库：`deepstorming`
- 分支：`codex/phase-2-provider-foundation`
- 结论：Phase 2 Provider Foundation 代码级与 macOS 目录包验收通过

## 1. 本阶段目标

完成本地 Provider 基线：SQLite 持久化、Migration、Secret Vault、Provider CRUD/启用/测试/取消、
安全 IPC/Preload、Renderer 管理 UI、开发版 E2E 与 macOS 目录包持久化证明。

## 2. 已完成内容

- Domain/Application/Contracts 定义 Provider 类型、能力、严格输入输出、稳定错误码与公开投影。
- Application 实现 Provider CRUD、启用、幂等写请求、连接测试、取消与测试终态持久化。
- Infrastructure 实现 `better-sqlite3` 数据库、Migration 1、SQLite Provider Repository、加密文件
  Secret Vault、启动对账、Mock Gateway 与 OpenAI-compatible Gateway。
- Electron Main 作为组合根：打开并迁移数据库、创建 Vault、启动对账、注册显式 IPC，并只记录稳定错误码。
- Preload 暴露显式 Provider API；Renderer 只依赖 Contracts 与本地 UI 模块。
- Provider UI 覆盖创建、编辑、启用、删除确认、连接测试、取消、成功/错误/加载/取消状态。
- E2E 覆盖开发版 Mock Provider lifecycle；packaged E2E 覆盖同一临时 `userData` 下重启持久化。

## 3. 精确版本与迁移

| 项目                  | 版本或值                  |
| --------------------- | ------------------------- |
| Node.js               | 24.14.0                   |
| pnpm                  | 11.7.0                    |
| Electron              | 43.1.0                    |
| electron-builder      | 26.15.3                   |
| better-sqlite3        | 12.11.1                   |
| @types/better-sqlite3 | 7.6.13                    |
| Migration             | 1 / `provider_foundation` |

Migration 1 创建 `app_settings`、`ai_providers`、`provider_write_requests` 和
`provider_test_operations`。数据库启动启用 WAL、Foreign Keys、`synchronous=NORMAL` 与
`busy_timeout=5000`。

## 4. 自动化验收结果

### `pnpm check`

结果：通过。

- 时间：2026-07-11 09:37 Asia/Shanghai
- 覆盖：ESLint、Prettier、全 workspace typecheck、Vitest、desktop build
- Vitest：24 个 Test File、322 个 Test 全部通过

### `pnpm test:e2e`

结果：通过。

- 时间：2026-07-11 09:34 Asia/Shanghai
- 开发版 E2E：1 passed
- Packaged persistence 测试：未先执行 `pnpm package:dir` 时按说明跳过
- 脚本行为：Playwright 前重建 Electron ABI，结束后恢复 Node ABI

### `pnpm package:dir`

结果：通过。

- 时间：2026-07-11 09:38 Asia/Shanghai
- 输出目录：`apps/desktop/release/mac-arm64/DeepStorming.app`
- Electron ABI：`better-sqlite3` 为 Electron 43.1.0 / arm64 重建
- 收尾：脚本恢复 Node ABI
- 限制：当前目录包未签名且使用默认 Electron 图标，发布前仍需品牌资源与签名流程

### Packaged persistence proof

命令：

```bash
pnpm exec playwright test tests/e2e/packaged-provider.spec.ts
```

结果：通过。

- 时间：2026-07-11 09:39 Asia/Shanghai
- 结果：1 passed
- 证明：第一次启动打包 App，在临时 `userData` 中创建 `Packaged Tutor` / `mock-success`；关闭后第二次以同一 `userData` 启动，Provider 与模型名仍存在。

### Node ABI 恢复抽查

结果：通过。

- 时间：2026-07-11 09:39 Asia/Shanghai
- 命令：`pnpm vitest run packages/infrastructure/src/database/package-dir-script.test.ts packages/infrastructure/src/database/database.test.ts`
- 结果：2 个 Test File、4 个 Test 通过

## 5. Secret Vault 与敏感信息证明

Secret Vault 使用 Electron `safeStorage` 加密字符串，SQLite 只保存随机 `secret_ref`。Renderer 公开
投影只包含 `hasApiKey`，不包含原始密钥、密文、Authorization Header 或 `secret_ref`。

已验证：

- Vault 写入采用随机引用和私有文件权限。
- 创建/更新/删除按“先写新密钥、事务引用、提交后清理旧密钥”的顺序执行。
- 启动对账删除未被数据库引用的 Vault 文件，并处理被打断的发布窗口。
- 清理失败只报告稳定 `secretRef` 与错误码，不抛出、不记录原始密钥。
- IPC/Preload 测试证明请求、响应与未知错误映射不会序列化敏感字段。

敏感信息扫描：

- 时间：2026-07-11 09:42 Asia/Shanghai
- 范围：Git tracked files、`apps/`、`packages/`、`tests/e2e/`、`docs/`、Playwright 报告与测试结果目录（存在时）
- 结论：禁止的 Phase 2 测试密钥签名未命中；禁止的 Authorization header 签名在测试 fixture 中已移除，未在生产、Renderer、SQLite、日志、fixture、snapshot、报告或包产物中命中。

## 6. 已知限制

- macOS 目录包未签名；发布前需要 Developer ID 签名、公证与品牌图标。
- OpenAI-compatible Gateway 目前实现 Chat Completions 基线，不包含流式响应、结构化输出或 embeddings。
- Phase 2 尚未实现课堂/文档业务对 Provider 的消费；Provider 基线为 Phase 3 的学习工作流入口。
- 当前 E2E 以 Mock Provider 为主，云 Provider 的真实凭据联调需要用户本地手动验证。

## 7. Phase 3 入口

Phase 3 可以在已完成的 Provider 基线上推进：

1. 将课堂/论文阅读用例接入 active Provider。
2. 增加真实模型调用的用户可见错误与重试体验。
3. 引入文档导入、证据选择、苏格拉底提问链路。
4. 补发布前签名、图标、公证和真实云 Provider 手动验收清单。

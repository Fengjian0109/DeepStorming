# DeepStorming 当前开发状态

- 更新时间：2026-07-10
- 当前分支：`codex/phase-2-provider-foundation`
- 当前阶段：Phase 1 收尾与 Phase 2 Provider 基线
- 状态：实施中

## 已完成

- Phase 0：需求、架构、数据库与开发计划基线。
- Phase 1：Electron 工程骨架、安全边界、类型安全 IPC 和基础打包。
- Phase 1 应用版本边界：Main 构建时注入根包版本，开发入口正确显示 DeepStorming 版本。
- macOS E2E：`pnpm test:e2e` 通过。
- Phase 2 设计：`docs/superpowers/specs/2026-07-10-phase-2-provider-foundation-design.md`。
- Phase 2 Provider 应用层：CRUD、激活、稳定错误映射与 Secret Vault 补偿顺序。
- Phase 2 SQLite Spike（2026-07-10T13:21:52Z）：`better-sqlite3@12.11.1` 与 `@types/better-sqlite3@7.6.13` 已锁定；Migration 1 创建 `app_settings`、`ai_providers`、`provider_write_requests` 和 `provider_test_operations`，包含 checksum、事务回滚和非空旧库升级前备份。
- Provider Repository：CRUD、revision CAS、唯一激活、原子引用检查删除、不可变写结果重放、JSON 运行时校验、Secret Ref 对账集合与连接测试状态转换均已持久化。

## 当前门禁

1. `pnpm check`：通过；13 个测试文件、217 个测试通过，包含 SQLite 专项 3 个文件、20 个测试；lint、format、全 workspace typecheck 与 build 通过。迁移恢复测试证明备份发生在任何 Schema DDL 前且备份失败不改变原库；快照测试覆盖连接状态原始结果重放和严格字段白名单。
2. `pnpm package:dir`：通过；Electron 43.1.0 为 arm64 重建原生模块，目录包位于 `apps/desktop/release/mac-arm64/DeepStorming.app`。
3. 原生模块证据：`Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node` 为 Mach-O 64-bit arm64 bundle；使用该目录包的 Electron runtime 从 `app.asar` 加载模块并完成临时 SQLite 的 create/insert/select，输出 `{"value":"ok"}`。
4. `electron-builder` 会在共享 pnpm workspace 中将原生模块切换为 Electron ABI；根 `package:dir` 在打包成功后确定性执行 Infrastructure 的 Node ABI 重建，随后 Node 24 runtime 同样完成临时 SQLite create/insert/select，避免打包后 Vitest/开发运行失效。

## 已知问题

- Secret Vault 以及剩余的 Provider Gateway、IPC 与 UI 垂直切片尚未实现。
- 目录包未签名并使用 Electron 默认图标；这不影响本次 SQLite 原生模块门禁，发布前仍需签名与品牌资源。

## 常用命令

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
```

## 下一步

执行 Phase 2 实施计划 Task 7：实现加密文件 Secret Vault。

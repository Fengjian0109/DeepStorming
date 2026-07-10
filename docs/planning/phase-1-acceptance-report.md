# DeepStorming Phase 0–1 验收报告

- 日期：2026-07-10
- 仓库：`deepstorming`
- 结论：代码级验收通过；真实桌面窗口 E2E 等待 macOS 验证

## 1. 本阶段目标

从空仓库建立可运行、可测试、可打包的 Electron 工程骨架，并固定后续所有业务功能必须遵守的安全边界和依赖方向。

## 2. 已完成内容

### 工程与版本

- 初始化新的 Git 仓库，未迁移旧版 Socratic Studio 代码。
- 建立 pnpm workspace。
- 固定 Node.js 24.14.0 与 pnpm 11.7.0。
- 精确锁定 Electron、React、Vite、TypeScript、Zod、Vitest 和 Playwright 版本。
- 建立依赖构建脚本白名单，未关闭 pnpm 供应链门禁。

### 模块边界

- `@deepstorming/domain`
- `@deepstorming/application`
- `@deepstorming/contracts`
- `@deepstorming/infrastructure`
- `@deepstorming/testkit`
- `@deepstorming/desktop`

ESLint 已禁止 Domain 导入框架或平台模块，也禁止 Renderer 导入 Electron、Node、Application、Domain 和 Infrastructure。

### Electron 安全基线

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webviewTag: false`
- 所有权限请求默认拒绝。
- 新窗口默认拒绝，仅允许受控外部 HTTP/HTTPS 链接交给系统浏览器。
- Renderer 使用严格 CSP，不能直接访问外部模型 API。
- Preload 只暴露细粒度 `window.deepstorming.app.getInfo()`。

根据 Electron 沙盒规则，Preload 已改为单文件、依赖全打包的 CommonJS 输出。没有通过关闭沙盒解决兼容问题。

### 类型安全 IPC

- 集中定义 IPC Channel。
- 请求和响应使用 Zod 运行时校验。
- 统一 `AppResult<T>` 与稳定错误码。
- 每个请求带 UUID Request ID。
- IPC Handler 只校验、调用 Use Case 和映射错误。

### 稳定性基础

- 结构化日志。
- API Key、Authorization、Token、Secret 和 Password 脱敏器。
- React Error Boundary。
- Mockable Application Port。
- 基础启动页面和运行版本显示。

### 文档

- 产品规格、技术架构、数据库设计和开发计划已进入仓库。
- 创建五份 ADR 和根目录 `AGENTS.md` 工程规则。

## 3. 精确版本

| 依赖             |    版本 |
| ---------------- | ------: |
| Node.js          | 24.14.0 |
| pnpm             |  11.7.0 |
| Electron         |  43.1.0 |
| Electron Vite    |   5.0.0 |
| Vite             |   7.3.6 |
| React            |  19.2.7 |
| TypeScript       |   6.0.3 |
| Zod              |   4.4.3 |
| Vitest           |  4.1.10 |
| Playwright       |  1.61.1 |
| electron-builder | 26.15.3 |

没有采用 TypeScript 7 或 Vite 8，因为当前 Electron Vite 和 ESLint 组合的 Peer Dependency 尚未同时兼容这些版本。

## 4. 自动化验收结果

### `pnpm check`

结果：通过。

包含：

- ESLint：通过。
- Prettier Check：通过。
- 六个 Workspace Project Typecheck：通过。
- Vitest：5 个 Test File、9 个 Test 全部通过。
- Main Build：通过。
- Preload Build：通过，输出单文件 `out/preload/index.js`。
- Renderer Build：通过。

### `pnpm package:dir`

结果：通过。

当前环境生成并验证了 Linux x64 目录包，主可执行文件为 `DeepStorming`。这证明 electron-builder 配置、ASAR 资源收集和 Workspace 打包链路可以工作，但不替代 macOS 打包验收。

### `pnpm test:e2e`

结果：当前受限容器未通过，等待 macOS 验证。

Electron 43 二进制已成功下载并执行，但当前容器禁止 D-Bus、NETLINK 和 udev，Chromium Renderer 在创建窗口时触发系统级崩溃。代码中保留了完整 E2E，用于验证：

- 应用窗口成功显示。
- Renderer 能通过类型安全 IPC 获得版本。
- `contextIsolation = true`。
- `nodeIntegration = false`。
- `sandbox = true`。

该项不能在当前环境中被诚实标记为通过。

## 5. macOS 阶段门禁

在 Mac 项目目录运行：

```bash
nvm install
nvm use
npm install --global pnpm@11.7.0
pnpm install
pnpm check
pnpm test:e2e
pnpm dev
pnpm package:dir
```

验收：

1. E2E 显示 `1 passed`。
2. `pnpm dev` 能打开 DeepStorming 基础页面。
3. 页面左下角显示 `v0.0.0 · darwin`。
4. 关闭窗口和重新启动均正常。
5. `pnpm package:dir` 生成可启动的 `DeepStorming.app` 目录包。

## 6. 已知限制

- 尚未加入 SQLite、Migration、Provider、密钥保存和 PDF 导入；它们属于下一阶段。
- 当前页面只是工程骨架状态页，不是正式产品首页。
- macOS 签名、公证和 DMG 不在本阶段。
- 根目录 E2E 必须在有真实桌面会话的环境运行。

## 7. 下一阶段进入条件

收到 macOS 上以下命令输出后进入 Phase 2：

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
```

Phase 2 将先做 SQLite 打包 Spike，再实现 Secret Vault、Mock Provider、DeepSeek 和 OpenAI-compatible Provider，避免再次出现 Provider 编辑崩溃或掩码覆盖 Key。

# DeepStorming 开发计划与验收方案

- 文档版本：v0.1
- 开发策略：从空仓库重建、纵向切片、阶段门禁
- 对应文档：`product_spec.md`、`architecture.md`、`database_schema.md`

## 1. 开发总原则

1. 不复制旧版 Socratic Studio 业务代码，只参考需求和已暴露 Bug。
2. 先打通一条完整学习闭环，再增加页面数量和沉浸功能。
3. 每一阶段必须完成自动化测试、手工验收和可打包构建后才能进入下一阶段。
4. 所有长任务先设计状态机、错误码和恢复策略，再写 UI。
5. 核心业务先用 Mock Adapter 测试，再接真实 PDF、SQLite 和模型。
6. 新功能必须服从依赖方向，不能通过“临时直接调用”绕过 Application Use Case。
7. 任何用户动作必须产生可见状态，禁止空 `catch` 和静默失败。

## 2. 版本路线

```text
Milestone A：工程与 Provider 基线
Milestone B：通用 PDF 文档底座
Milestone C：可引用的教材 AI 课堂
Milestone D：费曼评价、学习记忆与复习
Milestone E：论文深度阅读
Milestone F：伙伴体验与发布增强
```

首个可用 MVP 到 Milestone D。论文阅读属于下一核心里程碑，不要求重建底层。

## 3. Phase 0：需求冻结与工程准备

### 目标

把本规划转化为可执行仓库规则，确认所有高风险技术在正式开发前有验证任务。

### 工作项

1. 建立 `deepstorming` 空 Git 仓库。
2. 保存产品、架构、数据库和开发计划到 `docs/`。
3. 编写 ADR：Electron、模块化单体、SQLite、BYOK、通用文档模型。
4. 确认 macOS 最低支持版本和 Apple Silicon/Intel 构建策略。
5. 确认 Node、pnpm、Electron 和 TypeScript 的精确版本并锁定。
6. 建立测试 PDF 语料及其版权安全说明。
7. 确认 MVP OCR 策略：实现或仅检测并提示。

### 交付物

- `README.md`
- `docs/adr/*.md`
- `.nvmrc` 或等价运行时约束
- `pnpm-lock.yaml`
- 测试语料清单

### 验收门禁

- 所有未决问题有负责人、默认决定或明确延期阶段。
- 旧版代码不进入新仓库。
- 文档术语统一使用 DeepStorming、LearningDocument、LessonSession 和 SourceAnchor。

## 4. Phase 1：工程骨架与桌面安全边界

### 目标

建立可运行、可测试、可打包的 Electron 三进程骨架。

### 实施顺序

1. 初始化 pnpm workspace。
2. 创建 `apps/desktop` 和五个基础 Package。
3. 配置 React、TypeScript、Vite 和 Electron。
4. 建立 Main、Preload、Renderer 三层入口。
5. 开启 `nodeIntegration: false`、`contextIsolation: true` 和 Renderer Sandbox。
6. 建立 CSP 和外部链接白名单。
7. 定义 `AppResult<T>`、错误码和 IPC Channel Registry。
8. 使用 Zod 校验一个 `app.getVersion` 示例 IPC。
9. 配置 ESLint、Prettier、Vitest 和 Playwright。
10. 配置 electron-builder，完成 macOS 未签名开发包。
11. 增加结构化日志和脱敏器。
12. 增加全局错误边界和用户可见错误通知。

### 自动化测试

- Domain 包不能导入 Electron 或 React。
- Renderer 不能导入 Node 内置模块。
- IPC 非法输入返回稳定错误，不导致 Main 崩溃。
- 应用窗口可以由 Playwright 启动并读取版本。

### 验收门禁

以下命令全部成功：

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

构建后的应用能启动、关闭并输出脱敏日志。

## 5. Phase 2：SQLite、Migration 与 Provider 垂直切片

### 目标

先解决旧版最明显的 Provider 配置问题，同时验证 SQLite 原生依赖能稳定打包。

### 2A：SQLite 技术 Spike

1. 选择候选 SQLite Binding。
2. 在 Main Process 中建立连接工厂和 Repository Adapter。
3. 实现 `schema_migrations`、`app_settings` 和 `ai_providers`。
4. 验证 WAL、外键、事务和 busy timeout。
5. 验证开发、打包、Apple Silicon 构建和应用数据路径。
6. 验证数据库备份和迁移失败处理。

只有打包成功后才正式锁定 Binding，避免后期被原生模块阻塞。

### 2B：Secret Vault

1. 实现 `SecretVaultPort`。
2. 使用 Electron `safeStorage` 或 macOS Keychain 能力。
3. Renderer 只接收 `hasApiKey`。
4. Key 替换采用“先写新密钥，再事务更新引用，最后删除旧密钥”。
5. 日志脱敏测试覆盖 API Key 和 Authorization Header。

### 2C：Provider 功能

1. 实现 Mock Provider。
2. 实现 DeepSeek Provider。
3. 实现 OpenAI-compatible Provider。
4. 完成新增、编辑、删除、启用和连接测试。
5. 建立 Provider 能力声明。
6. 区分认证、限流、余额、网络、模型不存在和格式错误。

### 必测回归

- 编辑 Provider 名称但不填写新 Key，旧 Key 保持有效。
- UI 显示的掩码字符串不会保存为 Key。
- 新 Key 保存失败时旧 Key 仍可用。
- 删除 Provider 后安全存储同步清理。
- Mock Provider 可在无网络环境完成流式响应。
- Provider 错误只展示脱敏信息。

### 验收门禁

- Provider CRUD 和测试连接端到端通过。
- 打包后的应用也能保存并读取安全 Key。
- SQLite Migration 在空库和上一版本数据库上通过。
- Renderer 状态和日志中搜索不到测试 Key 明文。

## 6. Phase 3：通用 PDF 导入任务

### 目标

实现不会静默失败、可以恢复的 LearningDocument 导入管线。

### 3A：领域与用例

1. 定义 `Document`、`ImportJob`、`ImportStage` 和状态转换。
2. 实现 `StartDocumentImport`、`CancelImport`、`RetryImport`、`ResumePendingImports`。
3. 定义稳定错误码和可重试规则。
4. 为每个状态转换编写单元测试。

### 3B：文件与 Worker

1. 使用系统文件选择器获取 PDF。
2. 立即创建 Job 并在 UI 显示。
3. 复制到应用管理目录。
4. 计算 SHA-256 并检查重复。
5. Worker 使用 PDF.js 检查并解析页数、文本块和坐标。
6. 通过事件发送页级进度。
7. 支持用户取消和 Worker 异常隔离。

### 3C：结构化与持久化

1. 写入 `documents`、`document_pages` 和 `document_blocks`。
2. 识别基本目录或标题层级。
3. 清理重复页眉页脚，但保留原始文本。
4. 生成 `document_chunks`。
5. 构建 FTS5 索引。
6. 将文档置为 `ready`。

### 测试语料

至少准备：

- 普通单栏中文教材。
- 英文教材。
- 双栏学术论文。
- 含公式、表格和图片的论文。
- 纯扫描 PDF。
- 密码保护 PDF。
- 损坏 PDF。
- 页数较多的 PDF。

测试文件必须来自自建、公开授权或可安全使用的材料。

### 失败验收

- 扫描 PDF：显示“未检测到有效文本层”，并说明 OCR 是否可用。
- 密码 PDF：显示密码保护错误，不进入无限重试。
- 文件权限丢失：显示权限错误并允许重新选择。
- Worker 崩溃：Job 进入失败或可恢复状态，应用继续运行。
- 应用在 `EXTRACTING` 阶段关闭：重启后能恢复或安全重试。

### 验收门禁

- 点击导入后立即出现任务卡片。
- 全部测试 PDF 都得到 `ready` 或准确的失败类型。
- 不允许任何测试文件停留在无说明的永久 `running`。
- 相同文件重复导入得到明确提示。
- FTS 索引可以删除后重建。

## 7. Phase 4：文档库、PDF 阅读器与证据检索

### 目标

让用户能查看文档、检索内容，并从 AI 引用回到原页。

### 工作项

1. 文档库列表、状态、筛选和删除。
2. 文档详情页和结构大纲。
3. PDF.js 阅读器、页码、缩放、搜索和滚动定位。
4. SourceAnchor 与页面坐标转换。
5. 引用高亮和证据侧栏。
6. 实现 `SearchIndexPort` 和 FTS5/BM25 Adapter。
7. 增加章节范围、标题加权、邻接 Chunk 和去重。
8. 编写固定查询集，人工标注期望来源页。

### 检索质量验收

- 对固定测试问题返回的前若干结果包含人工标注来源。
- 搜索结果页码、Chunk 和原文一致。
- 引用点击能跳到正确页面并高亮相关区域或文本。
- 无证据时返回“证据不足”，不能生成虚假页码。

### 验收门禁

- 文档库、详情页和阅读器端到端通过。
- 文档删除不会影响其他文档。
- 引用定位测试在打包应用中通过。

## 8. Phase 5：教材课程与 AI 课堂

### 目标

完成第一条教材学习闭环。

### 5A：课程结构

1. 实现教材 Profile、概念、关系和学习目标。
2. 允许从章节生成课程结构草稿。
3. AI 生成内容标为 `draft`，用户可确认、修改或拒绝。
4. 建立概念与教材 Chunk 的来源关系。

### 5B：课堂状态机

1. 实现所有 LessonState 和合法转换。
2. 实现 `StartLesson`、`SendLearnerTurn`、`PauseLesson`、`ResumeLesson`。
3. 实现追问上限、提示阶梯和微讲解。
4. 实现问题支线栈。
5. 实现流式文本与最终结构化 TutorAction 分离。
6. 将一轮消息、引用、状态转换和 Model Run 放入一致事务。

### 5C：Prompt

1. 创建基础证据规则。
2. 创建苏格拉底教学策略。
3. 为每个课堂状态创建局部指令。
4. 建立 Prompt Template 版本与哈希。
5. 用固定学习对话建立回归样例。

### 必测行为

- 用户答对：先确认正确部分，再推进下一层。
- 用户部分答对：指出正确部分和一个主要缺口。
- 用户连续答错：进入提示阶梯，最终允许短讲解。
- 用户问支线问题：回答后能回到原目标。
- 用户请求直接解释：允许切换节奏，但随后要求复述。
- Provider 中断：重试不会生成重复消息或重复步骤。
- 应用重启：恢复到最后完成的一轮。

### 验收门禁

- 使用 Mock Provider 完成确定性课堂测试。
- 使用真实 Provider 完成至少一章教材学习。
- 教材事实性内容具备来源引用。
- 课堂可以暂停、退出和恢复。
- 不存在无法退出的苏格拉底追问循环。

## 9. Phase 6：费曼评价、误区与复习

### 目标

让“学会了”成为有证据、可修正的判断。

### 工作项

1. 实现 Teach-back 任务和多次尝试。
2. 实现正确性、完整性、因果性、清晰度和迁移性量表。
3. 保存正确部分、缺失点、误区和依据 Chunk。
4. 实现 `mastery_evidence` 追加写入。
5. 实现 `learner_concept_states` 重算服务。
6. 实现误区合并、次数更新和解决状态。
7. 实现 ReviewSchedulerPort 和首版调度策略。
8. 实现到期复习页、回答、反馈和下一次调度。
9. 完成课后整理幂等事务。

### 验收门禁

- 同一复述可重试并看到改进。
- 评价中的错误和缺口能追溯到教材证据。
- 重复执行课后整理不生成重复复习项目。
- 一次延迟复习可以更新掌握状态。
- 完成“配置 → 导入 → 课堂 → 复述 → 复习”完整 E2E。

到此达到教材 MVP。

## 10. Phase 7：论文深度阅读

### 目标

在不修改通用文档、课堂和引用底层的前提下加入 PaperLearningWorkflow。

### 7A：论文结构

1. 增加 Paper Profile 和论文 Migration。
2. 识别标题、作者、摘要、章节、参考文献和 Caption。
3. 支持用户修正识别结果。
4. 保存研究问题、贡献、方法、假设和局限草稿。

### 7B：论文学习地图

实现：

```text
Why → What → How → Evidence → Limits → Next
```

每一项绑定论文来源 Chunk、图、表或公式。

### 7C：学习模式

- 快速速览：问题、贡献、方法和结论。
- 深度精读：逐节苏格拉底式重构。
- 公式推导：符号、假设、直觉和推导。
- 实验审查：数据集、基线、指标、消融和结果解释。
- 审稿人模式：创新、正确性、证据、局限和改进建议。

### 7D：论文费曼任务

1. 三句话解释论文。
2. 向同领域但未读过论文的人解释研究动机。
3. 用自己的语言重构方法流程。
4. 解释关键公式和假设。
5. 说明每个主要实验验证什么。
6. 提出一个反例、缺失实验或后续研究问题。

### 验收门禁

- 双栏测试论文能完成结构识别或允许用户修正。
- 论文主要观点和实验建立 Evidence Link。
- AI 不把摘要改写冒充为深入理解。
- 用户能从论文评价跳回支持该评价的原文、图或表。
- 教材课堂的既有测试全部继续通过。

## 11. Phase 8：伙伴体验

### 目标

增加学习动力，同时保持伙伴与教学事实隔离。

### 工作项

1. 原创伙伴模板。
2. 表达风格与教学偏好分层。
3. 伙伴选择和关闭功能。
4. 课后叙事记忆生成。
5. 叙事记忆压缩和归档。
6. 防止伙伴 Prompt 覆盖证据与状态机规则。

### 验收门禁

- 开关伙伴前后，课堂事实、引用和掌握结果一致。
- 伙伴记忆不能写入掌握度表。
- 伙伴关闭后所有核心功能可用。

## 12. Phase 9：发布准备

### 工作项

1. macOS 图标、签名、公证和安装包。
2. 数据备份、恢复和卸载说明。
3. 隐私说明：本地数据与云模型发送边界。
4. 诊断信息导出。
5. 崩溃恢复和数据库完整性检查。
6. 大 PDF 性能测试和内存分析。
7. 无障碍和键盘导航检查。
8. 版本升级 Migration 演练。
9. 发布候选版本回归。

### 发布门禁

- 新安装和覆盖升级均通过。
- Provider Key 在升级后可用且未泄漏。
- 数据库备份和恢复演练成功。
- 所有 P0/P1 缺陷关闭。
- 完整 E2E 在签名后的发布包运行通过。

## 13. 测试矩阵

| 范围           | 单元 | 合约 | 集成 |  E2E |
| -------------- | ---: | ---: | ---: | ---: |
| 文档导入状态机 | 必须 | 必须 | 必须 | 必须 |
| Provider       | 部分 | 必须 | 必须 | 必须 |
| IPC            | 部分 | 必须 | 必须 | 必须 |
| 检索           | 必须 | 必须 | 必须 | 必须 |
| 课堂状态机     | 必须 | 必须 | 必须 | 必须 |
| 费曼评价       | 必须 | 必须 | 必须 | 必须 |
| 复习调度       | 必须 | 可选 | 必须 | 必须 |
| 论文工作流     | 必须 | 必须 | 必须 | 必须 |
| 伙伴表现       | 部分 | 可选 | 必须 | 必须 |

## 14. Definition of Done

任何功能只有同时满足以下条件才算完成：

1. 对应需求 ID 和验收标准明确。
2. 代码位于正确模块，没有违反依赖方向。
3. 输入、输出和错误使用运行时 Schema 校验。
4. 正常、失败、取消和重试路径均已实现。
5. 单元或合约测试覆盖核心规则。
6. 关键用户路径有 E2E 或明确的手工验收脚本。
7. 不记录敏感数据。
8. 数据库变更有 Migration 和回滚/恢复说明。
9. 文档同步更新。
10. `lint`、`typecheck`、`test` 和 `build` 全部通过。

## 15. 缺陷优先级

### P0

- 数据丢失或数据库损坏。
- API Key 泄漏。
- 应用无法启动或无法升级。
- 导入、课堂或复习主流程完全不可用。

### P1

- 用户操作静默失败。
- 引用跳错页或伪造来源。
- Provider 配置被错误覆盖。
- 课堂状态无法恢复或重复写入。
- 掌握结果与保存证据不一致。

### P2

- 非核心页面错误。
- 可恢复的性能或显示问题。
- 伙伴风格不一致但不影响教学。

P0/P1 未关闭时，不进入新功能阶段。

## 16. 风险清单

| 风险                   | 最早验证阶段 | 应对                                 |
| ---------------------- | ------------ | ------------------------------------ |
| SQLite 原生模块打包    | Phase 2      | 先做 Spike 和发布包测试              |
| PDF.js Worker 打包路径 | Phase 3      | 在骨架期固定资源加载策略             |
| 双栏阅读顺序错误       | Phase 3      | 布局块、坐标、测试论文和人工修正     |
| 模型结构化输出失败     | Phase 2/5    | Schema、有限重试、Mock 和错误降级    |
| Provider 协议差异      | Phase 2      | Capability + Adapter，不在课堂写分支 |
| 上下文与费用膨胀       | Phase 5      | 检索预算、会话摘要、用量记录         |
| 苏格拉底体验挫败       | Phase 5      | 提示阶梯、追问上限、直接解释入口     |
| 论文公式理解不足       | Phase 7      | 原页证据、视觉能力 Adapter、用户修正 |
| 伙伴喧宾夺主           | Phase 8      | 功能后置、独立数据和可关闭           |

## 17. 第一轮实施任务清单

规划确认后，第一轮代码只执行以下任务：

1. 创建空仓库与 pnpm workspace。
2. 固定运行时和依赖版本。
3. 创建 `domain/application/contracts/infrastructure/testkit`。
4. 创建 Electron Main、Preload、Renderer。
5. 配置安全基线。
6. 实现第一个类型安全 IPC。
7. 配置日志与错误边界。
8. 配置 lint、typecheck、unit 和 E2E。
9. 完成 macOS 开发包。
10. 输出 Phase 1 验收报告。

这十项完成并验收前，不开发 PDF 导入、课堂 UI 或伙伴系统。

## 18. 开发过程交付格式

每个 Phase 完成时输出：

```text
1. 本阶段目标
2. 实际改动文件
3. 架构边界变化
4. 数据库 Migration
5. 自动化测试结果
6. 手工验收结果
7. 已知限制
8. 下一阶段进入条件
```

任何“功能看起来能用但尚未测试”的状态必须明确标为未完成，不能作为阶段通过依据。

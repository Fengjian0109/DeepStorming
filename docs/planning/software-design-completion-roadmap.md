# DeepStorming 软件设计收敛路线图

- 日期：2026-07-15
- 目标：把当前已完成的 Provider / 文本文档 / LessonSession 基线，收敛到可发布 MVP 所需的剩余软件设计与实施顺序。
- 状态：Phase 5 Provider-backed lesson loop、Phase 6 PDF 文档底座、D3 文档阅读器/证据定位、D4 检索上下文、D5 TutorAction / LessonState 状态机、D6 Review Scheduler MVP、D7 Paper Lesson Mode MVP，以及 D1 DeepSeek 真实云 Provider 手动验收已完成；D8 已推进到自用版发布候选阶段，并保留更完整的论文工作流扩展与公开发布工作。

## AI-first workspace redesign 路线

本路线是旧 D1–D8 能力基线之上的产品重构，设计依据见：

- `docs/superpowers/specs/2026-07-14-ai-first-learning-workspace-redesign-design.md`
- `docs/superpowers/plans/2026-07-14-phase-1-chat-first-workspace.md`

| 阶段                                         | 状态                 | 范围                                                                                                                                              |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 1：interface foundation                | 已完成（2026-07-14） | 分层双侧栏、拖拽/收起、文档导入工具栏、紧凑详情与延迟阅读器、按教材分组的课程历史、纯对话课堂、固定输入框、信息抽屉、响应式/无障碍和 Electron E2E |
| Stage 2：AI-only tutor contract and settings | 已完成（2026-07-14） | 去除本地教学兜底；导师/伙伴提示词、性格、领域、头像和 Provider 设置；稳定 AI 错误与恢复语义                                                       |
| Stage 3：rich chat and citation pipeline     | 已完成（2026-07-15） | Markdown/LaTeX、强调引用、可选择文本 PDF 的图像提取与引用匹配、用户公式渲染                                                                       |
| Stage 4：lesson lifecycle and export         | 已完成               | 三档节奏、下课保存记忆、总结复习或休息、按教材保存多节完整课程、MD/PDF 聊天导出                                                                   |
| Stage 5：context compression and hardening   | 待开始               | 可配置阈值（默认剩余 30%）、AI 上下文精炼、token 统计、故障与长会话加固                                                                           |

Stage 1 只改变 Renderer 信息架构与交互，没有修改 Domain、Application、Infrastructure、IPC contract 或数据库 schema。完成 Stage 1 不代表 Stage 2–5 的 AI 教学能力已经交付。

## 1. 当前设计基线

DeepStorming 已经具备以下可继续扩展的架构边界：

- Domain 保持 framework/platform independent。
- Application 只依赖 Domain，并通过 Port 调用 Repository、Vault、Gateway、Clock、ID 生成器。
- Infrastructure 实现 SQLite、Secret Vault、Provider Gateway、Hasher 等 Port。
- Main Process 是组合根，IPC handler 只做输入校验、调用一个 use case、映射稳定错误。
- Preload 暴露显式细粒度 API，不暴露泛用 `invoke`。
- Renderer 只依赖 Contracts 与 UI，不直接导入 Electron、Node、Application、Infrastructure 或 Provider SDK。

当前已完成产品闭环：

1. Provider 管理、加密 Key 保存、连接测试、取消和持久化。
2. 纯文本与文本层 PDF Learning Document 导入、去重、搜索、删除和重启持久化。
3. PDF import job、应用私有文件副本、页面与文本块事实持久化。
4. LessonSession 从文档证据启动、首问、学习者回答、Provider-backed follow-up、生成记录、失败/取消保存、重试和安全错误摘要。
5. LessonState / LessonStep 状态机审计：每次首问、追问、失败、取消和重试都有可恢复的状态转移记录。
6. D6-MVP 学习诊断：成功课堂回答会生成可持久化的 MasteryEvidence；卡住表达会生成 MisconceptionSignal；课堂页和重启恢复都能展示“学习诊断”。
7. D6 Review Scheduler MVP：`suggestedReview` 的诊断会自动生成 lesson-scoped `ReviewItem`，课堂页可记录 `ReviewEvent` 并更新下一次复习时间。
8. D7 Paper Lesson Mode MVP：PDF 导入文档默认进入 `lessonMode='paper'`，课堂可展示论文阶段卡片、使用 paper tutor prompts，并在回答后推进/恢复 `paperProfile`。

## 2. 剩余软件设计队列

### D1. 真实云 Provider 手动验收与发布前收尾

目的：在不把真实 API Key 写入自动化环境的前提下，验证 DeepSeek 和 OpenAI-compatible Provider 的真实网络行为。

产物：

- `docs/planning/provider-cloud-release-acceptance.md`
- 手动验收矩阵：创建、启用、连接测试、课堂生成、取消、错误映射、重启持久化、敏感信息扫描。
- 发布前清单：图标、签名、公证、隐私说明、数据备份/恢复、升级 migration 演练。

进入条件：

- `pnpm check` 通过。
- `pnpm test:e2e` 通过。
- 用户本地可提供至少一个真实云 Provider API Key。

退出条件：

- 至少一个 DeepSeek 模型和一个 OpenAI-compatible endpoint 通过手动验收，或明确记录阻塞原因。
- 手动验收不把 API Key、Authorization header、原始响应正文写入仓库、日志、SQLite、fixtures、screenshots 或报告。

当前状态：

- DeepSeek 手动验收已完成并记录，使用 `deepseek-v4-flash` 成功通过创建、启用、连接测试、一次真实课堂生成与重启恢复验证。
- OpenAI-compatible 真实端点验收仍待真实 `HTTPS base URL + model + API key`，当前已补齐恢复执行设计与完成定义，但未把 mock 或文档推断当作真实验收结论。

### D2. PDF 文档底座

目的：把当前文本库扩展为可承接 PDF 的文档结构，不在第一刀实现 OCR、embedding 或复杂阅读器。

产物：

- `docs/superpowers/specs/2026-07-12-pdf-document-foundation-design.md`
- `docs/superpowers/plans/2026-07-12-pdf-document-foundation.md`
- 新增 PDF import job、managed file、page、text block 的 Domain / Contract / SQLite / Application / Main / Preload / Renderer / E2E 设计。

进入条件：

- D1 完成，或明确决定先做离线 PDF 能力。
- 确认可用 PDF 解析库和 Electron 打包策略。

退出条件：

- 文本型 PDF 可导入为持久化 document。**已完成。**
- 页面和 block 可恢复。**已完成。**
- 来源 anchor 能从 text offset 扩展到 page/block 坐标。**转入 D3。**
- 扫描 PDF、密码 PDF、损坏 PDF、超大 PDF 都能落入稳定失败状态。

### D3. 文档阅读器与证据定位

目的：让用户在 UI 中打开 PDF、查看页码、搜索文本、从命中的 block 启动课堂，并能从 AI 引用跳回证据。

设计范围（已完成）：

- PDF viewer shell。
- page navigation、search hit、block highlight（文本层 reader shell）。
- Lesson source anchor 扩展：`pageNumber`、`blockId`、`blockIndex`。
- 删除文档时级联删除 page/block/chunk/index，不破坏 lesson 审计历史中已保存的 snippet。

非目标：

- OCR。
- 图表理解。
- Embedding。
- 多窗口 PDF 阅读器。

实现说明：本阶段 intentionally 延后 canvas/zoom/bbox；阅读器使用已持久化 page/block 文本，课堂保留 text offset/snippet 作为审计兼容字段，并支持从课堂回到原 block。

### D4. Chunk / 检索 / 上下文预算

目的：把 page/block 转为可重建 chunk，建立词法检索和 lesson context budget。

设计范围：

- `document_chunks` 派生表。
- 可重建索引任务。
- FTS5/BM25 或等价词法检索。
- lesson generator 输入预算：最大 snippet 数、字符数、来源排序、摘要策略。
- 不把完整文档正文发送给 Provider。

当前状态：已完成。

完成结果：

- `document_chunks` 已作为可重建派生层进入文档导入流水线，并支撑课堂检索上下文。
- lesson model run 已持久化 `contextChunks` / `contextCharacterCount` 审计摘要。
- Renderer 已在每条生成记录下展示“上下文证据”页码范围与字符数。
- chunk 索引缺失时，课堂会稳定降级为 snippet-only，并在桌面端明确提示。
- E2E 已覆盖 PDF block 首问/追问两轮上下文证据，以及清空 `document_chunks` 后继续课堂的降级路径。

### D5. TutorAction / LessonState 状态机

目的：把当前“导师追问字符串”升级为可解释、可恢复、可测试的课堂状态机。

设计范围（已完成）：

- TutorAction：ask、hint、explain、reflect、summarize。
- LessonState：opening、probing、hinting、explaining、reflecting、summarizing、completed、paused、error。
- LessonStep：sequence、stateBefore/stateAfter、actionType、status、modelRunId/messageId、rationale、安全错误摘要。
- Start / Reply / Retry / Cancel 统一写入状态机审计链路，失败/取消不覆盖原始 step，重试追加新 step。
- Renderer 展示当前阶段与每条生成记录对应的动作/状态转移；历史会话缺少 step 时有兼容 fallback。

后续扩展：

- 更细的 TutorAction，例如 quiz / checkpoint。
- 基于真实学习表现的完成条件与状态跳转，而不只依赖 deterministic classifier。
- 用户“卡住”时的多级提示阶梯和可配置教学策略。

### D6. 费曼评价、误区与复习

目的：让课堂结果回写为掌握证据，并生成后续复习任务。

已完成的 D6-MVP：

- MasteryEvidence。
- Misconception。
- Deterministic 评分规则和安全错误边界。
- 课堂页“学习诊断”展示与重启持久化。

已完成的 D6 Review Scheduler MVP：

- ReviewItem / ReviewEvent。
- Scheduler：根据诊断结果创建、更新和调度 lesson-scoped 复习任务。
- 课堂页内的最小复习闭环：展示复习任务、记录 remembered / forgot、更新下一次 `dueAt`、重启后持久恢复。

剩余 D6 工作：

- 独立复习中心、跨课堂聚合、全局 due today 视图。
- 通知 / 日历 / 后台提醒。
- 更完整的评分 rubric，以及从 deterministic 规则升级到结构化诊断模型的边界。

### D7. 论文工作流

目的：支持论文结构、贡献、方法、证据、局限、研究启发的专用阅读路径。

已完成的 D7-MVP：

- PaperProfile / `lessonMode='paper'`。
- PDF 导入文档默认进入论文课堂模式。
- 论文专用首问/追问 prompt。
- `orientation -> problem_framing` 的最小阶段推进与重启恢复。
- 课堂页“当前论文阶段”展示。

剩余 D7 工作：

- Section / Claim / Evidence / Limitation 的结构化抽取与持久化。
- Why → What → How → Evidence → Limits → Next 地图。
- 更细粒度的 paper stage（方法、实验、局限、启发）推进规则。
- 跨论文工作区与论文专用复习聚合视图。

### D8. 发布候选

目的：从开发版走向可分发的 macOS 发布候选。

设计范围：

- 品牌图标。
- Developer ID 签名。
- Notarization。
- DMG 或 zip 分发。
- 隐私说明、诊断导出、备份恢复、升级演练。

当前状态：

- 自用版发布候选已推进到可本地打包、可重装、可备份的阶段。
- 已明确未签名自用版的隐私边界、备份/恢复建议与 Gatekeeper 限制。
- 签名、公证和公开分发仍待后续完成。

## 3. 推荐实施顺序

```text
D1 真实云 Provider 手动验收与发布前收尾（DeepSeek 已完成，OpenAI-compatible 待真实端点）
  ↓
D2 PDF 文档底座（已完成）
  ↓
D3 阅读器与证据定位（已完成）
  ↓
D4 Chunk / 检索 / 上下文预算（已完成）
  ↓
D5 TutorAction / LessonState（已完成）
  ↓
D6 Mastery Evidence / Misconception + Review Scheduler（已完成）
  ↓
D7 Paper Lesson Mode MVP（已完成）→ D7 论文工作流扩展
  ↓
D8 发布候选（当前已推进到自用版发布候选）
```

这个顺序的核心理由是：先完成真实 Provider 验收与发布前风险收敛，再基于已完成的 PDF / lesson / review 基线推进发布候选；当前已经先把 DeepSeek 和自用版发布候选打通，后续若继续推进，应围绕 OpenAI-compatible 真实验收、公开发布能力和更完整的论文工作流扩展，而不是回退基础课堂闭环。

## 4. 设计完成定义

每个设计切片完成前必须满足：

- 有明确 Domain / Application / Infrastructure / Main / Preload / Renderer 边界。
- 有稳定错误码和用户安全消息。
- 有持久化与恢复语义。
- 有取消、失败、重试语义；不适用时明确说明。
- 有自动化测试或手动验收清单。
- 文档更新到 `docs/planning/current-status.md` 和对应 phase 文档。
- `pnpm check` 通过；涉及桌面主流程时 `pnpm test:e2e` 通过。

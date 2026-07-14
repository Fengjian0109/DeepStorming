# D7.1 Paper Reading Map MVP 设计

- 日期：2026-07-14
- 状态：已选择 “紧凑地图卡片 UI + 可扩展证据数据底座”，待实施计划
- 上游依赖：D7 Paper Lesson Mode MVP、D5 LessonState 状态机、D4 文档 chunk / 证据上下文、D6 学习诊断与复习

## 1. 目标

D7.1 的目标是在现有 paper lesson 页面中增加一张可持久化的“论文阅读地图”，帮助用户把论文理解组织成六个核心问题：

1. Why：论文为什么要做这个问题。
2. What：论文核心贡献或主张是什么。
3. How：论文方法大概怎么解决问题。
4. Evidence：作者用什么证据支撑主张。
5. Limits：论文的限制、假设或薄弱点是什么。
6. Next：对用户后续研究、学习或实践有什么启发。

第一版不追求自动抽取完整论文结构树，而是让 paper lesson 从“阶段卡片 + 对话”升级为“阶段卡片 + 阅读地图 + 对话”。地图随着课堂启动和成功回答逐步补全，并在重启后恢复。

## 2. 非目标

本阶段明确不做：

- 不新增独立论文工作区。
- 不做 Section / Claim / Evidence / Limitation 的完整结构化抽取。
- 不做跨论文地图聚合、引用网络或文献综述。
- 不调用额外 Provider 专门生成地图。
- 不从失败或取消的 model run 中更新地图。
- 不把完整论文正文复制进地图槽位。

## 3. 方案选择

本轮比较了三种方向：

1. Compact Map Card：在课堂页中放一个紧凑六格卡片，快速展示当前理解。
2. Guided Reading Rail：把六个问题做成侧边阅读路径，强调阅读顺序。
3. Evidence-linked Map：每个槽位都保存摘要和证据 anchor，为后续结构化抽取做准备。

最终选择：

- UI 采用 Compact Map Card，放在“当前论文阶段”下面、证据和导师消息上面。
- 数据模型吸收 Evidence-linked Map 的核心能力，每个槽位都预留 `citedAnchorIds`。

这样第一版足够轻，但不会阻碍后续 D7.2 将 Section / Claim / Evidence / Limitation 抽取结果写入地图。

## 4. Domain / Contracts

扩展现有 `PaperLessonProfile`，不新增独立 Paper aggregate。

```ts
type PaperReadingMapSlotKind = 'why' | 'what' | 'how' | 'evidence' | 'limits' | 'next'

type PaperReadingMapSlotStatus = 'empty' | 'seeded' | 'updated'

type PaperReadingMapSlot = Readonly<{
  kind: PaperReadingMapSlotKind
  summary: string | null
  status: PaperReadingMapSlotStatus
  citedAnchorIds: readonly string[]
  updatedAt: string | null
}>

type PaperReadingMap = Readonly<{
  slots: readonly PaperReadingMapSlot[]
}>

type PaperLessonProfile = Readonly<{
  currentStage: PaperReadingStage
  stageSummary: string | null
  termsIntroduced: readonly string[]
  citedAnchorIds: readonly string[]
  readingMap: PaperReadingMap
}>
```

Domain 约束：

- `lessonMode = 'standard'` 时 `paperProfile = null`，不允许出现 `readingMap`。
- `lessonMode = 'paper'` 时 `paperProfile.readingMap` 必须存在。
- `readingMap.slots` 必须恰好包含六个固定 kind，不能缺失、重复或新增任意 kind。
- `summary` 为空时 `status = 'empty'` 且 `updatedAt = null`。
- `summary` 非空时最多 500 字，`updatedAt` 必须是 ISO 时间。
- `citedAnchorIds` 必须是已有 UUID 格式 anchor id；Domain 只校验格式，Application 负责保证引用来自当前 session。
- 旧数据读取时，如果 `paperProfile` 没有 `readingMap`，归一化为默认空地图，保证 migration 兼容。

Contracts 同步扩展 `LessonSessionDto` 的 paper profile schema。Renderer 仍只通过 Contracts 读取数据，不直接导入 Domain / Application。

## 5. Application 行为

### 5.1 StartLessonFromDocument

创建 paper lesson 时初始化默认阅读地图：

- `why` seeded：基于文档标题和首个 source snippet 生成一句“这篇论文试图澄清的问题”。
- `what` empty。
- `how` empty。
- `evidence` seeded：引用初始 anchor，并用一句话说明“当前证据片段是课堂入口”。
- `limits` empty。
- `next` empty。

初始化规则保持 deterministic，不调用 Provider，不记录完整 prompt 或完整论文正文。

### 5.2 SubmitLessonReply

只有成功生成 tutor follow-up 后才更新地图：

- 当当前 paper stage 从 `orientation` 推进到 `problem_framing`，更新 `why` 和 `what`。
- 当回答中出现方法相关线索，后续可更新 `how`，但 MVP 先只在 `method_intuition` 或 `method_mechanics` 阶段更新。
- 当回答围绕实验、结果、图表或证据，更新 `evidence`。
- 当回答表达“局限、假设、失败、不能说明、反例”等线索，更新 `limits`。
- 当回答表达“未来、应用、改进、迁移、启发”等线索，更新 `next`。

MVP 的更新策略可以先用 deterministic 文本规则。Provider 返回的 tutor 内容可以显示在消息中，但不直接作为地图事实写入，避免把模型输出误当成已验证结构化抽取。

### 5.3 Retry / Cancel / Failure

- retry 成功时，按成功 follow-up 的同一规则更新地图。
- retry 失败、reply 失败、取消生成都不更新地图。
- 地图更新与 session 保存同事务提交；不能出现 message 已保存但地图半更新的状态。

## 6. Infrastructure

当前 `lesson_sessions.paper_profile_json` 已保存完整 paper profile JSON。MVP 继续使用该字段，不新增 migration。

Repository 读取策略：

- 新数据：按扩展后的 `paperProfile.readingMap` 读取。
- 旧数据：如果 `paperProfile` 存在但缺少 `readingMap`，通过 Domain normalization 补默认空地图。
- standard lesson：继续保存 `paper_profile_json = null`。

Repository 写入策略：

- `paperProfile` 统一 JSON.stringify。
- 不保存 API key、Authorization header、Provider 原始响应、完整 prompt 或完整论文正文。

## 7. Renderer

在 `LessonWorkspace` 中，仅当：

```text
session.lessonMode === 'paper' && session.paperProfile !== null
```

时显示“论文阅读地图”卡片。

显示结构：

- 放在“当前论文阶段”卡片之后。
- 六个槽位以紧凑网格展示。
- 每个槽位展示中文标签、状态和摘要。
- 空槽位显示低调占位文案，例如“等待课堂继续补全”。
- 有 `citedAnchorIds` 的槽位显示“已关联证据”提示；MVP 不必提供每个 slot 的单独跳转按钮，避免 UI 过早复杂化。

文案建议：

- 标题：`论文阅读地图`
- Slot 标签：`Why / What / How / Evidence / Limits / Next`
- 空状态：`等待课堂继续补全`

standard lesson 完全不显示该卡片。

## 8. 测试策略

### Domain

- 默认 paper map 包含六个 slot。
- 缺失、重复或未知 slot kind 会被拒绝。
- standard lesson 携带 paper profile 会被拒绝。
- paper lesson 旧 profile 缺少 readingMap 时会补默认空地图。

### Contracts

- `LessonSessionDto` 接受带 `readingMap` 的 paper profile。
- standard session 的 `paperProfile = null` 仍然通过。
- 无效 slot kind、无效 status、无效 anchor id 被拒绝。

### Application

- paper document 启动 lesson 后带默认 reading map。
- 首个 anchor id 写入 `evidence` slot 的 `citedAnchorIds`。
- 成功回答后更新相关 slot，并保留 stage 推进。
- failed / cancelled run 不更新地图。
- retry 成功后可以更新地图。

### Infrastructure

- SQLite repository 能保存并读取带 `readingMap` 的 paper profile。
- 旧 `paper_profile_json` 缺少 `readingMap` 时读取兼容。
- standard lesson 继续保存 null profile。

### Renderer

- paper lesson 显示“论文阅读地图”和六个 slot。
- 空 slot 显示空状态。
- standard lesson 不显示地图。

### E2E

- 从 PDF paper 启动课堂后显示阅读地图。
- 提交回答后地图中至少一个 slot 更新。
- 重启后地图仍存在且内容一致。

## 9. 文档更新

实施完成后同步更新：

- `docs/planning/current-status.md`
- `docs/planning/software-design-completion-roadmap.md`

状态口径：

- D7.1 Paper Reading Map MVP 已完成。
- D7 剩余扩展继续保留 Section / Claim / Evidence / Limitation 抽取、跨论文工作区和论文专用复习聚合。

## 10. 完成定义

D7.1 完成必须满足：

- paper lesson 有可持久化阅读地图。
- standard lesson 不受影响。
- 地图显示在课堂页，重启后恢复。
- 成功回答或成功 retry 能更新地图。
- 失败和取消不更新地图。
- `pnpm check` 通过。
- 涉及桌面主流程时，`pnpm test:e2e` 通过或明确记录未运行原因。

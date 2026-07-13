# D4：Chunk 检索与上下文预算设计

## 状态

已确认，待用户审阅书面 spec 后进入实施计划。

## 目标

在现有 `page/block` 事实层之上增加可重建的 `chunk` 检索层，为课堂首轮启动和课堂进行中的每轮追问提供稳定、可解释、受预算约束的证据上下文。

## 非目标

本阶段不实现 embedding、语义检索、本地摘要压缩、OCR、复杂跨页语义拼接，也不把完整文档正文直接发送给 Provider。

## 用户流程

1. 用户从文档详情中的文本证据启动新课堂。
2. 系统基于当前选中的 snippet、文档标题和相邻 page/block 文本检索相关 chunk。
3. 系统按统一排序规则与预算规则挑选上下文，创建课堂并生成首轮问题。
4. 课堂进行中，用户提交回答后，系统基于上一轮导师问题、用户回答和已有来源锚点再次检索相关 chunk。
5. 系统继续沿用同一套预算规则组装 Provider 输入，不向 Provider 直接暴露完整文档正文。
6. 若 chunk 索引缺失、过期或重建失败，系统安全降级为仅使用现有 source snippet，不阻断课堂主流程。

## 核心设计

### 1. Chunk 是派生层，不是真相层

`document_chunks` 是从现有 `document_pages` / `document_text_blocks` 派生出来的检索单元，而不是新的手工内容层。原始真相仍然是文档、页和 block；chunk 只是为了检索和上下文拼装而生成。

这样做的原因：

- 不破坏 D3 已有的 PDF 证据链和 lesson source anchor。
- 未来更换 chunk 规则时可整批重建，而不污染原始 page/block 数据。
- 可以把“模型看什么材料”与“文档实际长什么样”分离，便于测试、调试和审计。

### 2. 双入口复用同一检索器

本阶段同时支持两个入口，并复用同一套检索和预算逻辑：

- 新课堂首轮：根据当前选中的 snippet、文档标题和邻近 block 文本检索。
- 课堂进行中：根据上一轮 tutor 问题、学习者回答和 lesson 已保存的来源锚点检索。

两种入口只在“查询种子”上不同，不复制预算器、排序器和 Provider 输入组装逻辑。

## 数据模型

首版 `document_chunks` 建议包含以下核心字段：

```ts
type DocumentChunk = {
  id: string
  documentId: string
  pageNumberStart: number
  pageNumberEnd: number
  blockIds: string[]
  text: string
  charCount: number
  sourceVersion: string
  rebuildToken: string
}
```

字段含义：

- `documentId`：所属文档。
- `pageNumberStart` / `pageNumberEnd`：chunk 覆盖的页范围。
- `blockIds`：chunk 对应的底层 block 标识，用于回溯证据。
- `text`：检索和送入模型的正文片段。
- `charCount`：预算裁剪时使用的字符计数。
- `sourceVersion`：chunk 建立时对应的文档结构版本，用于过期判断。
- `rebuildToken`：当前 chunk 规则的版本戳，用于规则变更后的整批重建。

首版不增加摘要字段、embedding 向量或人工标签。

## Chunk 生成规则

首版规则保持保守和可预测：

- 按 page/block 的自然顺序扫描。
- 将相邻 block 合并为长度适中的 chunk。
- 目标是单个 chunk 落在稳定字符窗口内，避免极碎片化，也避免单段过长。
- 不做复杂跨页重排，只允许自然跨页拼接。

这让 chunk 可以被稳定重建，同时减少首次实现中的不可解释行为。

## 检索与排序

### 1. 词法检索

SQLite 层新增 FTS5/BM25 或等价词法检索，用于按查询词命中 chunk。首版只做词法检索，不做语义召回。

首版词法查询会把自然语言输入拆成字母/数字/CJK token 后交给 SQLite FTS5；它能覆盖空格分隔、英文术语和精确 token 命中，但不承诺中文分词、同义词或跨语言召回。中文语义召回、embedding 和更强 tokenizer 留到后续检索升级。

### 2. 排序规则

检索结果先按词法相关性排序，再施加少量稳定业务规则做轻量加权：

- 已与当前 lesson 来源更接近的 chunk 轻微加分。
- 与当前 source page 距离更近的 chunk 轻微加分。
- 重复正文或重复 block 不重复入选。

排序目标不是“最聪明”，而是“稳定、可解释、可测试”。

## 上下文预算

Provider 输入预算在两个入口上统一为：

- 最多 `4` 个 chunk
- 最多 `2400` 字符

预算应用顺序：

1. 先按排序结果从高到低遍历。
2. 逐个尝试加入 chunk。
3. 一旦超过 `4 chunk` 或 `2400 chars` 其中任一上限，则停止加入。

这样保证每次课堂请求都不会把完整文档正文直接发给 Provider。

## 课堂输入组装

Provider generator 只接收预算后的 chunk 列表及其来源元数据，不直接读取完整文档正文。

首轮开课时，组装输入包括：

- 当前 source snippet
- 检索命中的 budgeted chunks
- 这些 chunks 对应的来源信息

课堂进行中时，组装输入包括：

- 上一轮 tutor 问题
- 用户回答
- lesson 已有来源锚点
- 检索命中的 budgeted chunks

## 降级、失败与取消

### 降级

若 chunk 索引未建立、已过期、文档被删除或暂时不可用，本次课堂请求安全降级为仅使用现有 source snippet，不阻断主流程。

### 失败

- chunk rebuild 失败时保留旧索引状态，并标记需要重建。
- 检索失败时记录稳定错误摘要，不把脏数据传给 Provider。
- 文档被删除或来源无效时沿用既有 lesson 稳定错误码和安全消息策略。

### 取消

检索本身不引入新的长任务取消控制；课堂生成取消时，沿用当前 lesson run 的 `started / cancelled / failed / succeeded` 持久化语义。已完成的检索结果无需回滚。

## 模块边界

- Domain：新增 `DocumentChunk`、chunk rebuild 规则输入输出和值对象化的上下文预算。
- Application：新增“重建 chunk 索引”“搜索相关 chunk”“组装课堂上下文”的 use case 与 ports。
- Infrastructure：实现 SQLite `document_chunks`、FTS 检索和 rebuild 逻辑。
- Main：继续只做组合根和单一 use case IPC 调用。
- Preload：继续暴露显式 API，不引入通用 invoke。
- Renderer：最多展示系统选用了哪些 chunk，不参与预算计算。
- Provider generator：只能拿到裁剪后的 chunk context，不读取完整文档。

## 验收测试

- Domain：chunk 模型、预算值对象、非法预算与重建规则输入。
- Application：首轮开课检索、课堂追问检索、预算裁剪、降级路径。
- Infrastructure：chunk rebuild、sourceVersion / rebuildToken 过期判断、FTS 检索排序可预测性。
- Main / Preload：显式 IPC 合同和稳定错误映射。
- Renderer：若展示 chunk 来源，验证 UI 显示与 lesson 来源一致。
- E2E：从 PDF block 开课时引入检索上下文；课堂回答后再次检索；chunk 缺失时安全降级但课堂仍可继续。

## 风险与后续

- 词法检索在同义表达和跨语言场景下召回有限，但实现简单、稳定且便于调试，适合作为 D4 首版。
- 未来如引入 embedding 或摘要压缩，应继续复用本阶段建立的 chunk 派生层与预算器，而不是绕开它们直接读全文。
- D5 状态机阶段可以直接消费本阶段产出的 budgeted chunk context，而不必重新设计 Provider 输入边界。

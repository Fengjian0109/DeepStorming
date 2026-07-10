# DeepStorming Phase 2 Provider Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Phase 1 macOS version E2E gap and deliver secure, persistent Provider CRUD, activation, connection testing, and cancellation on SQLite and Electron `safeStorage`.

**Architecture:** Domain owns Provider invariants; Application owns ordering and Ports; Infrastructure implements SQLite, encrypted-file Vault, and Provider gateways; Electron Main composes adapters and maps one use case per IPC handler; Preload exposes explicit APIs; Renderer consumes Contracts only. SQLite is authoritative for Provider metadata and secret references, while Vault reconciliation removes encrypted orphan files after crash windows.

**Tech Stack:** TypeScript 6.0.3, Electron 43.1.0, React 19.2.7, Zod 4.4.3, Vitest 4.1.10, Playwright 1.61.1, `better-sqlite3` 12.11.1, `@types/better-sqlite3` 7.6.13, Testing Library React 16.3.2, User Event 14.6.1, jsdom 29.1.1.

---

## File map

- `packages/domain/src/provider.ts`: Provider values, invariants, capabilities, and public profile.
- `packages/application/src/provider-ports.ts`: Repository, Vault, gateway, clock, and ID Ports.
- `packages/application/src/provider-use-cases.ts`: list/create/update/delete/activate orchestration.
- `packages/application/src/provider-test-operations.ts`: test/cancel orchestration and cancellation registry.
- `packages/contracts/src/provider.ts`: strict IPC schemas, DTOs, channels, and explicit API methods.
- `packages/infrastructure/src/database/*`: SQLite connection, migrations, and Repository.
- `packages/infrastructure/src/secrets/*`: encrypted-file Vault and cipher boundary.
- `packages/infrastructure/src/providers/*`: Mock and OpenAI-compatible gateways.
- `apps/desktop/src/main/composition-root.ts`: Main-only dependency composition.
- `apps/desktop/src/main/ipc/provider-handlers.ts`: one handler per use case.
- `apps/desktop/src/main/secrets/electron-safe-storage-cipher.ts`: Electron cipher adapter.
- `apps/desktop/src/renderer/src/provider/*`: Provider manager, form, list, and state.
- `docs/planning/current-status.md`: durable recovery entry point updated after each gate.

## Task 1: Create an isolated implementation workspace and status entry

**Files:**

- Create: `docs/planning/current-status.md`

- [ ] **Step 1: Invoke `using-git-worktrees`**

Create branch `codex/phase-2-provider-foundation` in the skill-selected safe worktree. Verify `git status --short` is empty before implementation.

- [ ] **Step 2: Write `current-status.md`**

Use this content:

````markdown
# DeepStorming 当前开发状态

- 更新时间：2026-07-10
- 当前分支：`codex/phase-2-provider-foundation`
- 当前阶段：Phase 1 收尾与 Phase 2 Provider 基线
- 状态：实施中

## 已完成

- Phase 0：需求、架构、数据库与开发计划基线。
- Phase 1：Electron 工程骨架、安全边界、类型安全 IPC 和基础打包。
- Phase 2 设计：`docs/superpowers/specs/2026-07-10-phase-2-provider-foundation-design.md`。

## 当前门禁

1. 修复开发入口错误显示 Electron 版本的问题。
2. 通过 macOS `pnpm test:e2e`。
3. 验证 `better-sqlite3` 在开发与 macOS 目录包中可读写。
4. 完成 Secret Vault 和 Provider 垂直切片。

## 已知问题

- E2E 当前收到 `v43.1.0 · darwin`，预期为 `v0.0.0 · darwin`。
- SQLite、Migration、Secret Vault 和 Provider 尚未实现。

## 常用命令

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
```

## 下一步

执行 Phase 2 实施计划 Task 2。
````

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec prettier --check docs/planning/current-status.md`

Expected: `All matched files use Prettier code style!`

```bash
git add docs/planning/current-status.md
git commit -m "docs: add current development status"
```

## Task 2: Fix the Phase 1 application-version boundary

**Files:**

- Create: `apps/desktop/src/main/app-version.ts`
- Create: `apps/desktop/src/main/app-version.test.ts`
- Create: `apps/desktop/src/main/build-globals.d.ts`
- Modify: `apps/desktop/electron.vite.config.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `tests/e2e/app.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeApplicationVersion } from './app-version'

describe('normalizeApplicationVersion', () => {
  it('trims the build version', () => {
    expect(normalizeApplicationVersion(' 0.0.0 ')).toBe('0.0.0')
  })

  it('rejects an empty build version', () => {
    expect(() => normalizeApplicationVersion(' ')).toThrow('Application version must not be empty')
  })
})
```

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run apps/desktop/src/main/app-version.test.ts`

Expected: FAIL because `./app-version` is missing.

- [ ] **Step 3: Implement the helper and build constant**

```ts
export const normalizeApplicationVersion = (buildVersion: string): string => {
  const version = buildVersion.trim()
  if (version.length === 0) throw new Error('Application version must not be empty')
  return version
}
```

Declare `__APP_VERSION__: string` in `build-globals.d.ts`. In Electron Vite config, parse the root `package.json`, require a non-empty string `version`, and add:

```ts
define: {
  __APP_VERSION__: JSON.stringify(applicationVersion)
}
```

Before `app.whenReady()`, normalize `__APP_VERSION__` once. Inject that value into
`ElectronAppInfoAdapter` and use it in the startup log; do not read the development Electron
executable version through `app.getVersion()`.

Add an adapter test where the Electron-like application reports `43.1.0` and the injected build
version is `0.0.0`; assert that the adapter returns `0.0.0`.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm vitest run apps/desktop/src/main/app-version.test.ts
pnpm check
pnpm test:e2e
```

Expected: unit PASS, check PASS, E2E `1 passed`, UI contains `v0.0.0`.

Update `current-status.md`, then commit:

```bash
git add apps/desktop/electron.vite.config.ts apps/desktop/src/main tests/e2e/app.spec.ts docs/planning/current-status.md
git commit -m "fix: report the DeepStorming application version"
```

## Task 3: Define Provider domain rules

**Files:**

- Create: `packages/domain/src/provider.ts`
- Create: `packages/domain/src/provider.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing invariant tests**

Test trimming, DeepSeek default URL, rejection of remote HTTP, loopback HTTP only under the test option, masked-key rejection, Mock key optionality, and cloud credential requirements.

```ts
expect(() =>
  normalizeProviderDraft({
    providerType: 'deepseek',
    displayName: 'DeepSeek',
    modelName: 'deepseek-chat',
    apiKey: '••••••••',
  }),
).toThrow('Masked API keys cannot be saved')
```

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run packages/domain/src/provider.test.ts`

Expected: FAIL because Provider exports are missing.

- [ ] **Step 3: Implement the exact public surface**

```ts
export const PROVIDER_TYPES = ['mock', 'deepseek', 'openai_compatible'] as const
export type ProviderType = (typeof PROVIDER_TYPES)[number]
export type ProviderTestStatus = 'testing' | 'success' | 'error' | 'cancelled'
export type ProviderCapabilities = Readonly<{
  streaming: boolean
  structuredOutput: boolean
  embedding: boolean
  vision: boolean
}>
export type ProviderDraft = Readonly<{
  providerType: ProviderType
  displayName: string
  baseUrl?: string
  modelName: string
  apiKey?: string
}>
export type ProviderProfile = Readonly<{
  id: string
  providerType: ProviderType
  displayName: string
  baseUrl?: string
  modelName: string
  hasApiKey: boolean
  capabilities: ProviderCapabilities
  isActive: boolean
  lastTestStatus?: ProviderTestStatus
  lastTestedAt?: string
  createdAt: string
  updatedAt: string
}>
```

Export `normalizeProviderDraft`, `assertProviderHasCredential`, and `capabilitiesFor`. Accept insecure URLs only for `localhost`, `127.0.0.1`, or `[::1]` when `allowInsecureLoopback` is true. Reject trimmed keys matching `/^[*•]+$/u`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run packages/domain/src/provider.test.ts && pnpm --filter @deepstorming/domain typecheck`

Expected: PASS.

```bash
git add packages/domain/src
git commit -m "feat: define provider domain rules"
```

## Task 4: Add Provider Contracts and explicit APIs

**Files:**

- Create: `packages/contracts/src/provider.ts`
- Create: `packages/contracts/src/provider.test.ts`
- Modify: `packages/contracts/src/app-result.ts`
- Modify: `packages/contracts/src/app-info.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write failing schema tests**

Prove strict requests reject unknown fields and masked keys, UUIDs are required, public profiles reject `secretRef`/`apiKey`, and all design error codes parse.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run packages/contracts/src/provider.test.ts`

Expected: FAIL because Provider schemas are missing.

- [ ] **Step 3: Implement channels and API surface**

```ts
export const PROVIDER_CHANNELS = {
  list: 'provider:list',
  create: 'provider:create',
  update: 'provider:update',
  remove: 'provider:remove',
  activate: 'provider:activate',
  testConnection: 'provider:test-connection',
  cancelTest: 'provider:cancel-test',
} as const
```

Create strict schemas and result types. Extend `DeepStormingApi` with `provider.list/create/update/remove/activate/testConnection/cancelTest`. Public DTOs expose `hasApiKey` only. Add all error codes from design section 7 to `appErrorCodeSchema`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run packages/contracts/src/provider.test.ts && pnpm --filter @deepstorming/contracts typecheck`

Expected: PASS.

```bash
git add packages/contracts/src
git commit -m "feat: define provider IPC contracts"
```

## Task 5: Implement Application CRUD and compensation

**Files:**

- Create: `packages/application/src/provider-ports.ts`
- Create: `packages/application/src/provider-errors.ts`
- Create: `packages/application/src/provider-use-cases.ts`
- Create: `packages/application/src/provider-use-cases.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/testkit/src/index.ts`

- [ ] **Step 1: Write fake-backed failing tests**

Prove: Vault write precedes Repository create; Repository failure removes the new ref; empty update Key retains the old ref; replacement commits the new ref before old cleanup; Vault failure leaves the old row untouched; delete removes metadata before Vault cleanup; activation rejects an unkeyed cloud Provider; list drops `secretRef`. Also prove deletion returns `PROVIDER_VALIDATION_FAILED` without changing metadata when blocking references exist.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run packages/application/src/provider-use-cases.test.ts`

Expected: FAIL because Ports/use cases are missing.

- [ ] **Step 3: Implement Ports**

```ts
export type StoredProvider = ProviderProfile & { readonly secretRef?: string }
export interface ProviderRepositoryPort {
  list(): Promise<readonly StoredProvider[]>
  findById(id: string): Promise<StoredProvider | undefined>
  create(provider: StoredProvider): Promise<void>
  update(provider: StoredProvider): Promise<void>
  remove(id: string): Promise<StoredProvider | undefined>
  activate(id: string, updatedAt: string): Promise<StoredProvider>
  updateTestStatus(
    id: string,
    status: ProviderTestStatus,
    testedAt: string,
  ): Promise<StoredProvider>
  referencedSecretRefs(): Promise<ReadonlySet<string>>
  hasBlockingReferences(id: string): Promise<boolean>
}
export interface SecretVaultPort {
  put(secret: string): Promise<string>
  get(ref: string): Promise<string>
  remove(ref: string): Promise<void>
  reconcile(referencedRefs: ReadonlySet<string>): Promise<void>
}
export interface ClockPort {
  now(): string
}
export interface IdGeneratorPort {
  generate(): string
}
```

- [ ] **Step 4: Implement minimal use cases**

Export `ListProviders`, `CreateProvider`, `UpdateProvider`, `DeleteProvider`, `ActivateProvider`, and `ProviderUseCaseError`. Each class receives only its used Ports. Drop secret references explicitly:

```ts
export const toProviderProfile = ({ secretRef, ...profile }: StoredProvider): ProviderProfile => ({
  ...profile,
  hasApiKey: secretRef !== undefined,
})
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run packages/application/src/provider-use-cases.test.ts && pnpm --filter @deepstorming/application typecheck`

Expected: PASS.

```bash
git add packages/application/src packages/testkit/src
git commit -m "feat: add provider management use cases"
```

## Task 6: Complete SQLite Spike, migrations, and Repository

**Files:**

- Modify: `packages/infrastructure/package.json`, `apps/desktop/electron-builder.yml`, `pnpm-lock.yaml`
- Create: `packages/infrastructure/src/database/database.ts`
- Create: `packages/infrastructure/src/database/migrations.ts`
- Create: `packages/infrastructure/src/database/migrations.test.ts`
- Create: `packages/infrastructure/src/database/sqlite-provider-repository.ts`
- Create: `packages/infrastructure/src/database/sqlite-provider-repository.test.ts`
- Modify: `packages/infrastructure/src/index.ts`

- [ ] **Step 1: Install exact dependencies**

```bash
pnpm --filter @deepstorming/infrastructure add @deepstorming/application@workspace:* @deepstorming/domain@workspace:* better-sqlite3@12.11.1
pnpm --filter @deepstorming/infrastructure add -D @types/better-sqlite3@7.6.13
```

- [ ] **Step 2: Write failing migration tests**

Assert WAL, foreign keys, `busy_timeout=5000`, migration 1 applied once, repeat startup idempotent, and changed checksum throws `DATABASE_MIGRATION_FAILED`. Seed a previous-version database, force a migration failure, and prove its original data remains readable and a backup exists.

- [ ] **Step 3: Implement connection and migration 1**

Create exact `schema_migrations`, `app_settings`, and `ai_providers` tables from `docs/database/database_schema.md`. Create:

```sql
CREATE UNIQUE INDEX one_active_ai_provider ON ai_providers(is_active) WHERE is_active = 1;
```

Hash immutable migration name+SQL with SHA-256. Before changing a non-empty existing database, use the `better-sqlite3` backup API to create a timestamped backup under `userData/backups`; then apply each migration and tracking row in one transaction. Phase 2 does not automatically delete backups.

- [ ] **Step 4: Write failing Repository tests, then implement**

Test create/list/update/remove, JSON runtime validation, rollback, and unique activation. Use prepared statements only and map snake_case rows at one boundary. Activation clears the old active row and sets the target inside one transaction.

- [ ] **Step 5: Configure and run packaging gate**

Add:

```yaml
asarUnpack:
  - '**/*.node'
npmRebuild: true
```

Run:

```bash
pnpm vitest run packages/infrastructure/src/database
pnpm --filter @deepstorming/infrastructure typecheck
pnpm build
pnpm package:dir
```

Expected: tests PASS, native rebuild PASS, macOS `DeepStorming.app` produced. Record evidence in `current-status.md`.

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure apps/desktop/electron-builder.yml pnpm-lock.yaml docs/planning/current-status.md
git commit -m "feat: add sqlite migrations and provider repository"
```

## Task 7: Implement encrypted-file Secret Vault

**Files:**

- Create: `packages/infrastructure/src/secrets/secret-cipher.ts`
- Create: `packages/infrastructure/src/secrets/encrypted-file-secret-vault.ts`
- Create: `packages/infrastructure/src/secrets/encrypted-file-secret-vault.test.ts`
- Create: `apps/desktop/src/main/secrets/electron-safe-storage-cipher.ts`
- Create: `apps/desktop/src/main/secrets/electron-safe-storage-cipher.test.ts`
- Modify: `packages/infrastructure/src/index.ts`

- [ ] **Step 1: Write failing tests**

With a fake cipher, assert no plaintext file content, UUID refs, 0600 mode, atomic rename with no `.tmp`, decrypting get, idempotent remove, path-validation, and reconciliation deleting only unreferenced Vault files.

- [ ] **Step 2: Implement the boundary**

```ts
export interface SecretCipher {
  isAvailable(): boolean
  encrypt(secret: string): Uint8Array
  decrypt(ciphertext: Uint8Array): string
}
```

`EncryptedFileSecretVault` accepts directory, cipher, and ID generator; validates `/^[0-9a-f-]{36}\.secret$/`; writes `<ref>.tmp` then renames. `ElectronSafeStorageCipher` delegates only to `safeStorage` methods and never logs values.

- [ ] **Step 3: Verify, scan, and commit**

```bash
pnpm vitest run packages/infrastructure/src/secrets apps/desktop/src/main/secrets
pnpm typecheck
rg -n "test-secret-value" apps packages --glob '!**/*.test.ts'
```

Expected: tests/typecheck PASS; no production secret match.

```bash
git add packages/infrastructure/src/secrets apps/desktop/src/main/secrets packages/infrastructure/src/index.ts
git commit -m "feat: store provider keys in the encrypted vault"
```

## Task 8: Implement Provider testing and cancellation

**Files:**

- Create: `packages/application/src/provider-test-operations.ts`
- Create: `packages/application/src/provider-test-operations.test.ts`
- Modify: `packages/application/src/provider-ports.ts`, `packages/application/src/index.ts`
- Create: `packages/infrastructure/src/providers/mock-provider-gateway.ts`
- Create: `packages/infrastructure/src/providers/openai-compatible-gateway.ts`
- Create: `packages/infrastructure/src/providers/provider-gateway-factory.ts`
- Create matching `*.test.ts` files
- Modify: `packages/infrastructure/src/index.ts`

- [ ] **Step 1: Write failing orchestration tests**

Prove `testing` is persisted before external work; success/error/cancelled persist terminal states; cloud reads Vault while Mock does not; duplicate operation IDs fail; cancel is idempotent; completion removes registry entries.

- [ ] **Step 2: Implement platform-neutral cancellation**

```ts
export interface CancellationToken {
  readonly cancelled: boolean
  onCancel(listener: () => void): () => void
}
export interface ProviderGatewayPort {
  testConnection(
    input: { modelName: string; apiKey?: string },
    token: CancellationToken,
  ): Promise<void>
}
export interface ProviderGatewayFactoryPort {
  create(provider: ProviderProfile): ProviderGatewayPort
}
```

Implement shared `ProviderTestOperations`, `TestProviderConnection`, and `CancelProviderTest`.

- [ ] **Step 3: Test and implement gateways**

Mock names deterministically cover success/auth/rate-limit/model-not-found/invalid/delay. Local HTTP tests cover 401, quota, 404, 429, malformed JSON, socket error, 15-second timeout, and cancel. Compatible gateway POSTs minimal Chat Completions JSON to normalized `/chat/completions`, bridges token to `AbortController`, validates minimal `choices`, and never includes Authorization or response bodies in errors. Implement `ProviderGatewayFactory`: `mock` returns Mock; `deepseek` returns the compatible gateway with `https://api.deepseek.com`; `openai_compatible` uses the normalized saved Base URL.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run packages/application/src/provider-test-operations.test.ts packages/infrastructure/src/providers
pnpm typecheck
git add packages/application/src packages/infrastructure/src/providers packages/infrastructure/src/index.ts
git commit -m "feat: test and cancel provider connections"
```

Expected: PASS before commit.

## Task 9: Compose persistence and expose safe IPC

**Files:**

- Create: `apps/desktop/src/main/composition-root.ts`
- Create: `apps/desktop/src/main/ipc/provider-handlers.ts`
- Create: `apps/desktop/src/main/ipc/provider-handlers.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`, `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`, `apps/desktop/src/renderer/src/global.d.ts`

- [ ] **Step 1: Write failing handler tests**

For every channel test valid input, strict rejection, stable `ProviderUseCaseError` mapping, unknown-to-`INTERNAL_ERROR`, and serialized absence of `apiKey`, `secretRef`, Authorization, and test secrets.

- [ ] **Step 2: Implement one-use-case-per-handler factories**

Each handler: parse request, call one `execute`, return validated DTO, map errors. No SQL, Vault, fetch, or business branching is allowed in handlers.

- [ ] **Step 3: Implement composition root**

Open `join(app.getPath('userData'), 'deepstorming.sqlite3')`; migrate before IPC registration; create Vault at `join(userData, 'secrets')`; reconcile Repository refs; construct shared cancellation registry and all use cases. Bootstrap logs only stable codes and quits on failure.

- [ ] **Step 4: Implement Preload API and verify**

Each named API generates request ID, invokes one fixed channel, validates one response schema, maps invalid output to `IPC_RESPONSE_INVALID`. Do not expose the private invoke helper.

```bash
pnpm vitest run apps/desktop/src/main/ipc
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src packages/contracts/src docs/planning/current-status.md
git commit -m "feat: expose provider management through safe IPC"
```

## Task 10: Build Provider management Renderer

**Files:**

- Modify: `apps/desktop/package.json`, `pnpm-lock.yaml`
- Create: `apps/desktop/src/renderer/src/provider/ProviderManager.tsx`
- Create: `apps/desktop/src/renderer/src/provider/ProviderForm.tsx`
- Create: `apps/desktop/src/renderer/src/provider/ProviderList.tsx`
- Create: `apps/desktop/src/renderer/src/provider/ProviderManager.test.tsx`
- Modify: `apps/desktop/src/renderer/src/app/App.tsx`, `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Install exact test dependencies**

```bash
pnpm --filter @deepstorming/desktop add -D @testing-library/react@16.3.2 @testing-library/user-event@14.6.1 jsdom@29.1.1
```

- [ ] **Step 2: Write failing component tests**

Test onboarding, empty edit Key with “留空则保留原密钥”, loading/success/error, test cancellation, delete confirmation, and text labels in addition to color.

- [ ] **Step 3: Implement focused components**

Use this state for every user action:

```ts
type AsyncState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }
  | { status: 'cancelled'; message: string }
```

`ProviderManager` owns list/operations, `ProviderForm` owns controlled inputs, and `ProviderList` renders cards/actions. Keep Key only in form-local state and clear it after submit. Generate test operation IDs with `crypto.randomUUID()`.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run apps/desktop/src/renderer/src/provider/ProviderManager.test.tsx
pnpm check
git add apps/desktop/src/renderer apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat: add provider management interface"
```

Expected: PASS before commit.

## Task 11: Add E2E and packaged persistence proof

**Files:**

- Modify: `tests/e2e/app.spec.ts`, `playwright.config.ts`
- Create: `tests/e2e/packaged-provider.spec.ts`

- [ ] **Step 1: Write failing Mock lifecycle E2E**

With a temporary user-data directory: assert version, onboarding, create `Offline Tutor`/`mock-success`, activate, test success, edit with empty Key, create `mock-delay`, cancel it, delete Providers, and return to onboarding.

- [ ] **Step 2: Add packaged restart test**

After `pnpm package:dir`, launch `DeepStorming.app` twice with the same temporary user-data directory. Create Mock Provider on run one; verify it remains on run two. Explicitly skip with reason on non-macOS.

- [ ] **Step 3: Run and commit**

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
pnpm exec playwright test tests/e2e/packaged-provider.spec.ts
git add tests/e2e playwright.config.ts
git commit -m "test: cover provider lifecycle in desktop builds"
```

Expected: every command exits 0.

## Task 12: Document decisions and close Phase 2

**Files:**

- Create: `docs/adr/0006-sqlite-binding.md`
- Create: `docs/adr/0007-secret-vault.md`
- Modify: `docs/adr/README.md`, `docs/planning/current-status.md`
- Create: `docs/planning/phase-2-acceptance-report.md`

- [ ] **Step 1: Write ADRs**

ADR 0006 records `better-sqlite3` 12.11.1, synchronous transaction rationale, exact macOS rebuild/package evidence, WAL/foreign-key/busy-timeout, rejected sqlite3/WASM, and Electron-upgrade rebuild consequences. ADR 0007 records safeStorage+encrypted files, random refs, atomic rename, 0600 mode, startup reconciliation, crash windows, deletion retry, Renderer exclusion, and rejected plaintext/masked persistence.

- [ ] **Step 2: Run sensitive-data scan**

```bash
git grep -n -I -e 'Authorization: Bearer' -e 'sk-deepstorming-phase2-secret'
rg -n -I 'sk-deepstorming-phase2-secret' apps packages release test-results playwright-report
```

Expected: no production, Renderer, SQLite, log, fixture, snapshot, report, or package match.

- [ ] **Step 3: Write acceptance evidence**

Report exact timestamps/results, test counts, package path, migration versions, Vault proof, secret scan, limitations, and Phase 3 entry. Mark `current-status.md` complete only if all gates pass; otherwise keep “实施中” with the exact failing command.

- [ ] **Step 4: Run fresh final verification**

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
pnpm exec playwright test tests/e2e/packaged-provider.spec.ts
git diff --check
git status --short
```

Expected: all test/build commands exit 0; diff check empty; status lists intended docs only.

- [ ] **Step 5: Commit and complete branch workflow**

```bash
git add docs
git commit -m "docs: record phase 2 provider acceptance"
```

Invoke `verification-before-completion`, then `requesting-code-review`, address verified findings and rerun affected gates, then invoke `finishing-a-development-branch`.

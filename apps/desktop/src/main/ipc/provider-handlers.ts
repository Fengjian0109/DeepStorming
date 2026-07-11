import { randomUUID } from 'node:crypto'

import { ProviderUseCaseError } from '@deepstorming/application'
import {
  activateProviderRequestSchema,
  cancelProviderTestRequestSchema,
  cancelProviderTestResultSchema,
  createProviderRequestSchema,
  listProvidersRequestSchema,
  listProvidersResultSchema,
  providerResultSchema,
  removeProviderRequestSchema,
  testProviderConnectionRequestSchema,
  updateProviderRequestSchema,
  voidResultSchema,
  type AppError,
  type AppResult,
  type CancelProviderTestResult,
  type CreateProviderRequest,
  type ListProvidersResult,
  type ProviderProfileDto,
  type ProviderResult,
  type RemoveProviderRequest,
  type UpdateProviderRequest,
  type VoidResult,
} from '@deepstorming/contracts'

type Awaitable<T> = T | Promise<T>
type SafeParseResult<T> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; error: Readonly<{ issues: readonly unknown[] }> }>
type Schema<T> = Readonly<{ safeParse(input: unknown): SafeParseResult<T> }>
type ResultSchema<T> = Readonly<{
  safeParse(input: unknown): Readonly<{ success: true; data: T }> | Readonly<{ success: false }>
}>

type ProviderProfile = ProviderProfileDto
type ProviderList = readonly ProviderProfileDto[]
type CancelProviderTestData = CancelProviderTestResult extends AppResult<infer T> ? T : never
const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u

export type ProviderIpcHandlers = Readonly<{
  list(input: unknown): Promise<ListProvidersResult>
  create(input: unknown): Promise<ProviderResult>
  update(input: unknown): Promise<ProviderResult>
  remove(input: unknown): Promise<VoidResult>
  activate(input: unknown): Promise<ProviderResult>
  testConnection(input: unknown): Promise<ProviderResult>
  cancelTest(input: unknown): Promise<CancelProviderTestResult>
}>

export type ProviderIpcDependencies = Readonly<{
  listProviders: { execute(): Awaitable<ProviderList> }
  createProvider: { execute(input: CreateProviderRequest): Awaitable<ProviderProfile> }
  updateProvider: { execute(input: UpdateProviderRequest): Awaitable<ProviderProfile> }
  deleteProvider: { execute(input: RemoveProviderRequest): Awaitable<void> }
  activateProvider: { execute(input: RemoveProviderRequest): Awaitable<ProviderProfile> }
  testProviderConnection: {
    execute(
      input: Readonly<{ requestId: string; providerId: string; operationId: string }>,
    ): Awaitable<ProviderProfile>
  }
  cancelProviderTest: {
    execute(input: Readonly<{ operationId: string }>): Awaitable<CancelProviderTestData>
  }
}>

const requestIdFrom = (input: unknown): string => {
  if (
    input !== null &&
    typeof input === 'object' &&
    'requestId' in input &&
    typeof input.requestId === 'string' &&
    UUID.test(input.requestId)
  ) {
    return input.requestId
  }

  return randomUUID()
}

const invalidRequest = (requestId: string, issueCount: number): AppResult<never> => ({
  ok: false,
  error: {
    code: 'INVALID_REQUEST',
    message: 'The provider request is invalid.',
    retryable: false,
    details: { issueCount },
  },
  requestId,
})

const internalError = (requestId: string): AppResult<never> => ({
  ok: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: 'The provider request could not be completed.',
    retryable: true,
  },
  requestId,
})

const mapError = (error: unknown, requestId: string): AppResult<never> => {
  if (error instanceof ProviderUseCaseError) {
    const mapped: AppError = {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details === undefined ? {} : { details: error.details }),
    }

    return { ok: false, error: mapped, requestId }
  }

  return internalError(requestId)
}

const validated = <Result extends AppResult<unknown>>(
  result: Result,
  schema: ResultSchema<Result>,
): Result => {
  const parsed = schema.safeParse(result)
  if (!parsed.success) throw new Error('IPC result failed validation')
  return parsed.data
}

const handle = async <
  Request extends { requestId: string },
  Data,
  Result extends AppResult<unknown>,
>(
  input: unknown,
  requestSchema: Schema<Request>,
  resultSchema: ResultSchema<Result>,
  execute: (request: Request) => Awaitable<Data>,
): Promise<Result> => {
  const requestId = requestIdFrom(input)
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return validated(invalidRequest(requestId, parsed.error.issues.length) as Result, resultSchema)
  }

  try {
    const data = await execute(parsed.data)
    return validated({ ok: true, data, requestId: parsed.data.requestId } as Result, resultSchema)
  } catch (error) {
    const result = mapError(error, parsed.data.requestId) as Result
    return validated(result, resultSchema)
  }
}

export const createProviderIpcHandlers = (
  dependencies: ProviderIpcDependencies,
): ProviderIpcHandlers => ({
  list: (input) =>
    handle(input, listProvidersRequestSchema, listProvidersResultSchema, () =>
      dependencies.listProviders.execute(),
    ),
  create: (input) =>
    handle(input, createProviderRequestSchema, providerResultSchema, (request) =>
      dependencies.createProvider.execute(request),
    ),
  update: (input) =>
    handle(input, updateProviderRequestSchema, providerResultSchema, (request) =>
      dependencies.updateProvider.execute(request),
    ),
  remove: (input) =>
    handle(input, removeProviderRequestSchema, voidResultSchema, async (request) => {
      await dependencies.deleteProvider.execute(request)
      return {}
    }),
  activate: (input) =>
    handle(input, activateProviderRequestSchema, providerResultSchema, (request) =>
      dependencies.activateProvider.execute(request),
    ),
  testConnection: (input) =>
    handle(input, testProviderConnectionRequestSchema, providerResultSchema, (request) =>
      dependencies.testProviderConnection.execute({
        requestId: request.requestId,
        providerId: request.id,
        operationId: request.operationId,
      }),
    ),
  cancelTest: (input) =>
    handle(input, cancelProviderTestRequestSchema, cancelProviderTestResultSchema, (request) =>
      dependencies.cancelProviderTest.execute({ operationId: request.operationId }),
    ),
})

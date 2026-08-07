import { randomUUID } from 'node:crypto'
import { Result } from 'better-result'
import { z } from 'zod'

import type { ResolvedBachsConfig } from './define_config.ts'
import {
  BachsConflict,
  BachsForbidden,
  BachsNotFound,
  BachsPreconditionRequired,
  BachsRateLimited,
  BachsRequestFailed,
  BachsResponseUnexpected,
  BachsUnauthorized,
  BachsValidationFailed,
  toShapeIssues,
  type BachsApiFailure,
  type BachsErrorCode,
  type FieldError,
} from './failures.ts'

/** Query string values a request may carry. Absent values are dropped. */
export type QueryParams = Readonly<
  Record<string, string | number | boolean | undefined | null | ReadonlyArray<string>>
>

export type RequestOptions<S extends z.ZodType> = {
  /** Names the call in failures and telemetry, e.g. `createCheckoutSession`. */
  readonly operation: string
  /** Parses the response body into the value callers receive. */
  readonly schema: S
  readonly query?: QueryParams
  readonly body?: unknown
  /**
   * Ties this write to a business operation so a retry — here, in your job
   * runner, or by a customer double-clicking — returns the first response
   * instead of charging twice.
   *
   * Every write gets a key: when you do not supply one, the client generates
   * a key per call and reuses it across that call's own retries. Supply your
   * own (an order ID, say) to extend that guarantee across process restarts.
   */
  readonly idempotencyKey?: string
  /**
   * Retry on 429 and 5xx. Defaults to true for GET, and for writes that carry
   * an idempotency key — which, by the rule above, is all of them.
   */
  readonly retry?: boolean
}

/** The response shape shared by every Bachs list endpoint. */
export const PaginationSchema = z.object({
  next_cursor: z.string().nullable().optional(),
  prev_cursor: z.string().nullable().optional(),
  has_more: z.boolean().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
  returned: z.number().int().optional(),
  total: z.number().int().optional(),
})

export type Pagination = z.infer<typeof PaginationSchema>

/**
 * One page of a list endpoint.
 *
 * @template T - The item type.
 */
export type Page<T> = {
  readonly items: ReadonlyArray<T>
  readonly pagination: Pagination
}

/**
 * Builds the page schema for a list endpoint. Every Bachs list answers with
 * `items` and `pagination`, never with the resource name.
 *
 * @template S - The schema for one item.
 */
export function pageOf<S extends z.ZodType>(item: S) {
  return z.object({
    items: z.array(item),
    pagination: PaginationSchema.optional().default({}),
  })
}

const USER_AGENT = 'adonis-bachs'

/** Statuses that a retry could plausibly resolve. */
function isTransient(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * The outbound adapter for the Bachs HTTP API. It owns authentication,
 * idempotency, retries and response parsing, and reports every expected
 * failure through the returned result rather than by throwing.
 */
export class BachsClient {
  readonly #config: ResolvedBachsConfig

  constructor(config: ResolvedBachsConfig) {
    this.#config = config
  }

  /** The environment this client talks to, decided by the API key. */
  get environment(): ResolvedBachsConfig['environment'] {
    return this.#config.environment
  }

  /**
   * Performs a GET and parses the response.
   *
   * @template S - The schema for the response body.
   * @returns The parsed value, or the failure that stopped the call.
   */
  get<S extends z.ZodType>(
    path: string,
    options: Omit<RequestOptions<S>, 'body' | 'idempotencyKey'>
  ): Promise<Result<z.infer<S>, BachsApiFailure>> {
    return this.request('GET', path, options)
  }

  /**
   * Performs a POST and parses the response.
   *
   * @template S - The schema for the response body.
   * @returns The parsed value, or the failure that stopped the call.
   */
  post<S extends z.ZodType>(
    path: string,
    options: RequestOptions<S>
  ): Promise<Result<z.infer<S>, BachsApiFailure>> {
    return this.request('POST', path, options)
  }

  /**
   * Performs a PATCH and parses the response.
   *
   * @template S - The schema for the response body.
   * @returns The parsed value, or the failure that stopped the call.
   */
  patch<S extends z.ZodType>(
    path: string,
    options: RequestOptions<S>
  ): Promise<Result<z.infer<S>, BachsApiFailure>> {
    return this.request('PATCH', path, options)
  }

  /**
   * Performs a PUT and parses the response.
   *
   * @template S - The schema for the response body.
   * @returns The parsed value, or the failure that stopped the call.
   */
  put<S extends z.ZodType>(
    path: string,
    options: RequestOptions<S>
  ): Promise<Result<z.infer<S>, BachsApiFailure>> {
    return this.request('PUT', path, options)
  }

  /**
   * Performs a DELETE and parses the response. Bachs answers `204` with an
   * empty body for most deletes, which parses as `null`.
   *
   * @template S - The schema for the response body.
   * @returns The parsed value, or the failure that stopped the call.
   */
  delete<S extends z.ZodType>(
    path: string,
    options: RequestOptions<S>
  ): Promise<Result<z.infer<S>, BachsApiFailure>> {
    return this.request('DELETE', path, options)
  }

  /**
   * Issues the request, retrying transient failures, and parses the response.
   *
   * The idempotency key is minted once here and reused by every attempt, so a
   * retry after a timeout can never produce a second charge: Bachs replays the
   * cached 2xx for that key instead of running the handler again.
   *
   * @template S - The schema for the response body.
   * @returns The parsed value, or the failure that stopped the call.
   */
  async request<S extends z.ZodType>(
    method: string,
    path: string,
    options: RequestOptions<S>
  ): Promise<Result<z.infer<S>, BachsApiFailure>> {
    const url = this.#buildUrl(path, options.query)
    const isWrite = method !== 'GET'
    const idempotencyKey = isWrite ? (options.idempotencyKey ?? randomUUID()) : null
    const shouldRetry = options.retry ?? (!isWrite || idempotencyKey !== null)
    const maxAttempts = shouldRetry ? this.#config.retries + 1 : 1

    let attempt = 0

    while (true) {
      attempt++

      const sent = await this.#send(method, url, options, idempotencyKey)
      if (Result.isError(sent)) {
        const canRetry = attempt < maxAttempts && shouldRetry
        if (canRetry) {
          await sleep(this.#backoff(attempt))
          continue
        }
        return sent
      }

      const response = sent.value
      const body = await this.#readBody(response)

      if (response.ok) {
        return this.#parse(response, body, options)
      }

      if (isTransient(response.status) && attempt < maxAttempts) {
        await sleep(this.#backoffFor(response, attempt))
        continue
      }

      return Result.err(this.#toFailure(response, body, options.operation))
    }
  }

  /**
   * Parses the body. Bachs returns resources flat, with no envelope to unwrap:
   * `items` and `pagination` on lists, the object itself everywhere else.
   */
  #parse<S extends z.ZodType>(
    response: Response,
    body: unknown,
    options: RequestOptions<S>
  ): Result<z.infer<S>, BachsApiFailure> {
    const parsed = options.schema.safeParse(body)

    if (!parsed.success) {
      return Result.err(
        new BachsResponseUnexpected({
          operation: options.operation,
          requestId: response.headers.get('x-request-id'),
          issues: toShapeIssues(parsed.error.issues),
          message: `Bachs returned an unexpected shape during ${options.operation}`,
        })
      )
    }

    return Result.ok(parsed.data)
  }

  /** Builds the absolute URL, dropping query values that are undefined or null. */
  #buildUrl(path: string, query?: QueryParams): string {
    const url = new URL(`${this.#config.baseUrl}${path}`)

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) {
        continue
      }

      if (Array.isArray(value)) {
        for (const entry of value) {
          url.searchParams.append(key, String(entry))
        }
        continue
      }

      url.searchParams.set(key, String(value))
    }

    return url.toString()
  }

  async #send<S extends z.ZodType>(
    method: string,
    url: string,
    options: RequestOptions<S>,
    idempotencyKey: string | null
  ): Promise<Result<Response, BachsRequestFailed>> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.#config.apiKey.reveal()}`,
      'Accept': 'application/json',
      'User-Agent': USER_AGENT,
    }

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    if (idempotencyKey !== null) {
      headers['Idempotency-Key'] = idempotencyKey
    }

    const doFetch = this.#config.fetch ?? globalThis.fetch

    try {
      const response = await doFetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.#config.timeout),
      })

      return Result.ok(response)
    } catch (cause: unknown) {
      return Result.err(
        new BachsRequestFailed({
          operation: options.operation,
          responseStatus: null,
          errorCode: null,
          requestId: null,
          detail: null,
          docUrl: null,
          cause,
          message: `Bachs request failed during ${options.operation}: ${describeCause(cause)}`,
        })
      )
    }
  }

  /**
   * Parses the body as JSON, falling back to raw text so a proxy's HTML error
   * page surfaces as a failure instead of a JSON.parse crash. A `204` and an
   * empty body both read as `null`.
   */
  async #readBody(response: Response): Promise<unknown> {
    if (response.status === 204) {
      return null
    }

    const text = await response.text().catch(() => '')

    if (text === '') {
      return null
    }

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  /**
   * Honours Retry-After when present, otherwise backs off exponentially with
   * full jitter. The jitter only spreads retries in time; nothing
   * user-visible depends on its randomness.
   */
  #backoffFor(response: Response, attempt: number): number {
    const retryAfter = parseSeconds(response.headers.get('retry-after'))

    if (retryAfter !== null) {
      return retryAfter * 1000
    }

    return this.#backoff(attempt)
  }

  #backoff(attempt: number): number {
    return Math.random() * 300 * 2 ** (attempt - 1)
  }

  #toFailure(response: Response, body: unknown, operation: string): BachsApiFailure {
    const error = readError(body)
    const requestId = response.headers.get('x-request-id')
    const shared = {
      operation,
      errorCode: error.errorCode,
      requestId,
      detail: error.detail,
      docUrl: error.docUrl,
    }
    const message =
      error.detail ?? `Bachs responded with ${response.status} during ${operation}`

    switch (response.status) {
      case 401:
        return new BachsUnauthorized({ ...shared, message })
      case 403:
        return new BachsForbidden({ ...shared, message })
      case 404:
        return new BachsNotFound({ ...shared, message })
      case 409:
        return new BachsConflict({ ...shared, message })
      case 400:
      case 422:
        return new BachsValidationFailed({
          ...shared,
          errors: error.errors,
          details: error.details,
          message,
        })
      case 428:
        return new BachsPreconditionRequired({ ...shared, message })
      case 429:
        return new BachsRateLimited({
          ...shared,
          retryAfter: parseSeconds(response.headers.get('retry-after')),
          resetAt: parseSeconds(response.headers.get('x-ratelimit-reset')),
          message,
        })
      default:
        return new BachsRequestFailed({
          ...shared,
          responseStatus: response.status,
          cause: null,
          message,
        })
    }
  }
}

/** The flat error object Bachs returns on every non-2xx. */
const ErrorBodySchema = z.object({
  detail: z.string().optional(),
  error_code: z.string().optional(),
  doc_url: z.string().optional(),
  errors: z
    .array(z.object({ field: z.string(), message: z.string(), type: z.string() }))
    .optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

type ReadError = {
  detail: string | null
  errorCode: BachsErrorCode | null
  docUrl: string | null
  errors: ReadonlyArray<FieldError>
  details: Readonly<Record<string, unknown>> | null
}

/**
 * Reads Bachs' own error fields from a failure body. Error bodies are the one
 * place we cannot assume the documented shape, since a proxy or a load
 * balancer may answer instead of the API.
 */
function readError(body: unknown): ReadError {
  const empty: ReadError = {
    detail: null,
    errorCode: null,
    docUrl: null,
    errors: [],
    details: null,
  }

  if (typeof body === 'string') {
    return { ...empty, detail: body.trim() === '' ? null : body.trim().slice(0, 200) }
  }

  const parsed = ErrorBodySchema.safeParse(body)
  if (!parsed.success) {
    return empty
  }

  return {
    detail: parsed.data.detail ?? null,
    errorCode: parsed.data.error_code ?? null,
    docUrl: parsed.data.doc_url ?? null,
    errors: parsed.data.errors ?? [],
    details: parsed.data.details ?? null,
  }
}

/** Describes an unknown thrown value without serialising it. */
function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.name === 'TimeoutError' ? 'the request deadline elapsed' : cause.message
  }

  return typeof cause
}

function parseSeconds(header: string | null): number | null {
  if (header === null) {
    return null
  }

  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

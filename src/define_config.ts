import { redact, Redacted } from './redacted.ts'

/**
 * Remembers which events have already been processed, so a Bachs retry does
 * not run your handler twice. Provide your own to share the state across
 * processes (Redis, a database table, …).
 */
export type WebhookDedupeStore = {
  seen(eventId: string): Promise<boolean> | boolean
  remember(eventId: string): Promise<void> | void
}

/**
 * Reads the current time in milliseconds. Injected rather than read from the
 * ambient clock so replay windows and de-duplication are testable.
 */
export type Clock = () => number

/**
 * Which Bachs environment a key belongs to. Going live is a key swap, so this
 * is inferred from the key prefix unless you state it.
 */
export type BachsEnvironment = 'sandbox' | 'production'

/** Configuration accepted from `config/bachs.ts`. */
export type BachsConfig = {
  /**
   * Secret API key: `sk_sandbox_…` in the sandbox, `sk_live_…` in production.
   * Server-side only — never ship it to a browser or a mobile app. The browser
   * needs no key at all: it only ever receives a `checkout_url`.
   */
  readonly apiKey: string | Redacted<string>

  /**
   * Webhook endpoint signing secret. Found on the endpoint in the developer
   * portal, or returned once when you create the endpoint through the API.
   *
   * Pass an array to accept several secrets at once. Rotation takes effect the
   * moment you rotate, so deploying the new secret alongside the old one is
   * the only way to rotate without dropping deliveries.
   */
  readonly webhookSecret?:
    | string
    | Redacted<string>
    | ReadonlyArray<string | Redacted<string>>

  /**
   * Which environment to talk to. Inferred from the API key prefix when
   * omitted. Stating it turns a forgotten key swap into a startup error
   * instead of a live charge against sandbox expectations.
   */
  readonly environment?: BachsEnvironment

  /**
   * Overrides the base URL entirely. Only needed to point at a proxy or a
   * record/replay fixture; the environment already selects the right host.
   */
  readonly baseUrl?: string

  /** Request deadline in milliseconds. @default 15000 */
  readonly timeout?: number

  /**
   * Retry attempts after a 429 or 5xx. Reads are always retried. Writes are
   * retried only when they carry an `Idempotency-Key`, because Bachs replays
   * the cached response for that key rather than charging twice. @default 2
   */
  readonly retries?: number

  /**
   * How long a delivery stays remembered for de-duplication, in milliseconds.
   * @default 21600000 (6 hours)
   */
  readonly dedupeTtl?: number

  /**
   * How far a webhook's `X-Bachs-Timestamp` may drift from your clock before
   * the delivery is rejected as a replay, in seconds. @default 300
   */
  readonly webhookTolerance?: number

  /**
   * Webhook de-duplication. Defaults to an in-memory store; set to false to
   * disable, or pass your own for cross-process de-duplication.
   */
  readonly dedupe?: false | WebhookDedupeStore

  /** Overrides the global fetch. This is the seam tests use. */
  readonly fetch?: typeof globalThis.fetch

  /** Overrides the clock. This is the seam time-dependent tests use. */
  readonly now?: Clock
}

/** Configuration with defaults applied and secrets wrapped. */
export type ResolvedBachsConfig = {
  readonly apiKey: Redacted<string>
  readonly webhookSecrets: ReadonlyArray<Redacted<string>>
  readonly environment: BachsEnvironment
  readonly baseUrl: string
  readonly timeout: number
  readonly retries: number
  readonly dedupeTtl: number
  readonly webhookTolerance: number
  readonly dedupe: false | WebhookDedupeStore | null
  readonly fetch: typeof globalThis.fetch | null
  readonly now: Clock
}

const BASE_URLS: Record<BachsEnvironment, string> = {
  sandbox: 'https://sandbox-api.bachs.io',
  production: 'https://api.bachs.io',
}

const KEY_PREFIXES: ReadonlyArray<{ prefix: string; environment: BachsEnvironment }> = [
  { prefix: 'sk_sandbox_', environment: 'sandbox' },
  { prefix: 'sk_test_', environment: 'sandbox' },
  { prefix: 'sk_live_', environment: 'production' },
]

const DEFAULTS = {
  timeout: 15_000,
  retries: 2,
  dedupeTtl: 6 * 60 * 60 * 1000,
  webhookTolerance: 300,
} as const

/**
 * Defines the Bachs configuration. Used from `config/bachs.ts`.
 */
export function defineConfig(config: BachsConfig): BachsConfig {
  return config
}

/** The environment a key prefix implies, or null when the prefix is unknown. */
function environmentOf(apiKey: string): BachsEnvironment | null {
  return KEY_PREFIXES.find(({ prefix }) => apiKey.startsWith(prefix))?.environment ?? null
}

/** Wraps every configured webhook secret, keeping the rotation list flat. */
function resolveWebhookSecrets(
  configured: BachsConfig['webhookSecret']
): ReadonlyArray<Redacted<string>> {
  if (configured === undefined) {
    return []
  }

  const list = Array.isArray(configured) ? configured : [configured]

  return (list as ReadonlyArray<string | Redacted<string>>)
    .filter((secret) => (typeof secret === 'string' ? secret !== '' : true))
    .map((secret) => redact(secret))
}

/**
 * Applies defaults, wraps secrets, and refuses to start on a key that
 * contradicts the configured environment.
 *
 * A sandbox key pointed at production only ever produces confusing 401s; a
 * live key pointed at the sandbox silently tests nothing. Both are startup
 * defects, so both are thrown rather than returned.
 *
 * @throws {Error} When no API key is configured, when its prefix is not one
 * Bachs issues and no environment was stated, or when the key and the stated
 * environment disagree.
 */
export function resolveConfig(config: BachsConfig): ResolvedBachsConfig {
  const apiKey = redact(typeof config.apiKey === 'string' ? config.apiKey : config.apiKey.reveal())
  const raw = apiKey.reveal()

  if (raw === '') {
    throw new Error(
      'Missing Bachs API key. Set BACHS_API_KEY in your .env — create one in the Bachs developer portal under API Keys.'
    )
  }

  const implied = environmentOf(raw)

  if (config.environment !== undefined && implied !== null && implied !== config.environment) {
    throw new Error(
      `Bachs environment mismatch: config/bachs.ts sets environment "${config.environment}" but the API key is a ${implied} key. Going live is a key swap — set BACHS_API_KEY to the ${config.environment} key, or drop the environment setting to follow the key.`
    )
  }

  const environment = config.environment ?? implied

  if (environment === null) {
    throw new Error(
      'Cannot tell which Bachs environment this API key belongs to. Keys start with "sk_sandbox_" or "sk_live_"; set `environment` explicitly in config/bachs.ts if you are using a proxy that rewrites keys.'
    )
  }

  return {
    apiKey,
    webhookSecrets: resolveWebhookSecrets(config.webhookSecret),
    environment,
    baseUrl: (config.baseUrl ?? BASE_URLS[environment]).replace(/\/+$/, ''),
    timeout: config.timeout ?? DEFAULTS.timeout,
    retries: config.retries ?? DEFAULTS.retries,
    dedupeTtl: config.dedupeTtl ?? DEFAULTS.dedupeTtl,
    webhookTolerance: config.webhookTolerance ?? DEFAULTS.webhookTolerance,
    dedupe: config.dedupe ?? null,
    fetch: config.fetch ?? null,
    now: config.now ?? Date.now,
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto'
import { Result } from 'better-result'
import type { HttpContext } from '@adonisjs/core/http'

import type { Clock, ResolvedBachsConfig, WebhookDedupeStore } from './define_config.ts'
import {
  toShapeIssues,
  WebhookPayloadUnexpected,
  WebhookSignatureInvalid,
  type WebhookFailure,
} from './failures.ts'
import {
  EventDataSchemas,
  EventEnvelopeSchema,
  isBachsEvent,
  type AnyBachsEventPayload,
  type BachsEvent,
  type BachsEventPayloads,
} from './events.ts'

/** Unix timestamp, in seconds, of when Bachs sent the delivery. */
const TIMESTAMP_HEADER = 'x-bachs-timestamp'
/** HMAC-SHA256 hex digest of `"{timestamp}.{raw_body}"`. */
const SIGNATURE_HEADER = 'x-bachs-signature'

const DEDUPE_MAX_ENTRIES = 10_000

/**
 * A verified delivery of one specific event.
 *
 * @template E - The event this delivery carries.
 */
type DeliveryOf<E extends BachsEvent> = {
  readonly event: E
  /** The event's ID, prefixed `evt_`. Deliveries are deduplicated on it. */
  readonly id: string
  readonly organizationId: string | null
  /** When the event occurred, as sent. */
  readonly createdAt: string | null
  readonly payload: BachsEventPayloads[E]
}

/**
 * A verified event delivery.
 *
 * Left unparameterised this is a discriminated union over every event, so
 * narrowing on `event` narrows `payload` with it:
 *
 * ```ts
 * if (delivery.event === 'collection.succeeded') {
 *   delivery.payload.amount // typed, without a cast
 * }
 * ```
 *
 * `E extends E` is what distributes the type over the union rather than
 * collapsing it into one shape whose `payload` is every payload at once.
 *
 * @template E - The event this delivery carries.
 */
export type WebhookDelivery<E extends BachsEvent = BachsEvent> = E extends E
  ? DeliveryOf<E>
  : never

type Handler<E extends BachsEvent> = (
  payload: BachsEventPayloads[E],
  delivery: WebhookDelivery<E>
) => unknown | Promise<unknown>

/**
 * Handlers keyed by event, plus an optional `'*'` fallback for every event
 * without a specific handler.
 */
export type WebhookHandlers = {
  [E in BachsEvent]?: Handler<E>
} & {
  '*'?: (
    event: BachsEvent,
    payload: AnyBachsEventPayload,
    delivery: WebhookDelivery
  ) => unknown | Promise<unknown>
}

/**
 * Process-local de-duplication. Good enough for a single-process app; pass
 * your own store backed by Redis or a table when you run several, since Bachs
 * may deliver the same event to any one of them.
 */
export class MemoryDedupeStore implements WebhookDedupeStore {
  /** Events completed successfully, keyed by expiry of their TTL window. */
  readonly #completed = new Map<string, number>()
  /** Events with an active claim — currently being handled, or abandoned. */
  readonly #claims = new Set<string>()
  readonly #now: Clock
  readonly #ttl: number

  constructor(now: Clock = Date.now, ttl = 6 * 60 * 60 * 1000) {
    this.#now = now
    this.#ttl = ttl
  }

  /**
   * Acquires the processing right for a delivery. Check and mark happen in the
   * same synchronous pass, so two concurrent callers cannot both win: a
   * completed event, or one already claimed, loses.
   *
   * @returns Whether the caller got the processing right.
   */
  claim(delivery: WebhookDelivery): boolean {
    this.#prune()

    if (this.#completed.has(delivery.id) || this.#claims.has(delivery.id)) {
      return false
    }

    this.#claims.add(delivery.id)
    return true
  }

  /** Records the event as processed for the rest of the TTL window. */
  complete(eventId: string): void {
    this.#claims.delete(eventId)
    this.#prune()
    this.#completed.set(eventId, this.#now() + this.#ttl)
  }

  /** Drops the claim so a failed delivery can be retried. */
  release(eventId: string): void {
    this.#claims.delete(eventId)
  }

  #prune(): void {
    const now = this.#now()

    for (const [id, expiresAt] of this.#completed) {
      if (expiresAt <= now) {
        this.#completed.delete(id)
      }
    }

    /**
     * Hard cap so a flood of deliveries cannot grow the map without bound.
     * Map iterates in insertion order, so this drops the oldest first.
     */
    while (this.#completed.size > DEDUPE_MAX_ENTRIES) {
      const oldest = this.#completed.keys().next()
      if (oldest.done) {
        break
      }
      this.#completed.delete(oldest.value)
    }
  }
}

/**
 * Receiving webhook deliveries.
 *
 * Webhooks are the source of truth for fulfilment. A customer who closes the
 * tab before the redirect still paid, and a redirect back to your success URL
 * proves nothing on its own — anyone can visit it. Grant access here.
 */
export class WebhooksReceiver {
  readonly #config: ResolvedBachsConfig
  readonly #dedupe: WebhookDedupeStore | false

  constructor(config: ResolvedBachsConfig) {
    this.#config = config
    this.#dedupe =
      config.dedupe === false
        ? false
        : (config.dedupe ?? new MemoryDedupeStore(config.now, config.dedupeTtl))
  }

  /**
   * Verifies that a request genuinely came from Bachs and parses its payload.
   *
   * Your endpoint URL is public, so anyone who finds it can post to it — never
   * act on a payload this has not accepted.
   *
   * @returns The delivery, or why it could not be trusted.
   */
  verify(ctx: HttpContext): Result<WebhookDelivery, WebhookFailure> {
    const { request } = ctx

    /**
     * The signature covers the raw bytes exactly as received. AdonisJS'
     * bodyparser keeps them for JSON requests, so no extra configuration is
     * needed — but re-serialising `request.body()` would produce different
     * bytes and every signature would fail.
     */
    const rawBody = request.raw()
    if (rawBody === null || rawBody === '') {
      return Result.err(reject('the request body was empty'))
    }

    const timestamp = request.header(TIMESTAMP_HEADER)
    if (timestamp === undefined) {
      return Result.err(reject(`the ${TIMESTAMP_HEADER} header is missing`))
    }

    const received = request.header(SIGNATURE_HEADER)
    if (received === undefined) {
      return Result.err(reject(`the ${SIGNATURE_HEADER} header is missing`))
    }

    const sentAt = Number(timestamp)
    if (!Number.isFinite(sentAt)) {
      return Result.err(reject(`the ${TIMESTAMP_HEADER} header is not a unix timestamp`))
    }

    /**
     * The timestamp is inside the signed message, so an attacker cannot move
     * it without invalidating the digest. Checking it bounds how long a
     * captured delivery stays replayable.
     */
    const driftSeconds = Math.abs(this.#config.now() / 1000 - sentAt)
    if (driftSeconds > this.#config.webhookTolerance) {
      return Result.err(
        reject(
          `the delivery is ${Math.round(driftSeconds)}s outside the ${this.#config.webhookTolerance}s tolerance`
        )
      )
    }

    if (this.#config.webhookSecrets.length === 0) {
      return Result.err(
        reject(
          'no webhook signing secret is configured. Set BACHS_WEBHOOK_SECRET — it is shown on the endpoint in the developer portal, and returned once when you create an endpoint through the API'
        )
      )
    }

    const message = `${timestamp}.${rawBody}`

    /**
     * Every configured secret is tried so a rotation can deploy the new secret
     * alongside the old one. Rotating takes effect immediately on Bachs' side,
     * so without this a rotation drops every delivery in flight.
     */
    const verified = this.#config.webhookSecrets.some((secret) =>
      safeEqual(received, createHmac('sha256', secret.reveal()).update(message, 'utf8').digest('hex'))
    )

    if (!verified) {
      return Result.err(reject('the digest does not match'))
    }

    return this.#parsePayload(rawBody)
  }

  /**
   * Verifies the request, claims the delivery so only one caller handles it,
   * runs the matching handler and answers 200.
   *
   * ```ts
   * await bachs.webhooks.handle(ctx, {
   *   'collection.succeeded': async (payload) => fulfil(payload.reference),
   * })
   * ```
   *
   * The handler is awaited, so a handler that throws produces a non-2xx and
   * Bachs retries the delivery. The claim is released in that case, so the
   * retry runs the handler again rather than being dropped as a duplicate.
   * Push slow work onto a queue rather than doing it inline: the delivery has
   * a deadline, and a retried event you already half-processed is harder to
   * reason about than one you queued.
   *
   * @returns The delivery that was processed.
   * @throws {WebhookSignatureInvalid} When the signature does not verify. This
   * is the AdonisJS-facing seam: the exception carries a 401 status, so the
   * framework's exception handler renders it. Call {@link verify} instead to
   * receive the failure as a value.
   * @throws {WebhookPayloadUnexpected} When the body is not an event payload.
   * @throws {unknown} The original error, when the handler throws.
   */
  async handle(ctx: HttpContext, handlers: WebhookHandlers): Promise<WebhookDelivery> {
    const verified = this.verify(ctx)
    if (Result.isError(verified)) {
      throw verified.error
    }

    const delivery = verified.value
    const store = this.#dedupe

    if (store !== false && !(await store.claim(delivery))) {
      ctx.response.ok({ received: true, duplicate: true })
      return delivery
    }

    try {
      await runHandler(delivery, handlers)
    } catch (error) {
      if (store !== false) {
        await store.release(delivery.id)
      }
      throw error
    }

    if (store !== false) {
      await store.complete(delivery.id)
    }

    ctx.response.ok({ received: true })
    return delivery
  }

  /**
   * Parses the verified body. The event name is read from the signed body, so
   * a caller cannot be steered into the wrong handler by editing a header.
   */
  #parsePayload(rawBody: string): Result<WebhookDelivery, WebhookFailure> {
    let decoded: unknown
    try {
      decoded = JSON.parse(rawBody)
    } catch {
      return Result.err(reject('the body is not valid JSON'))
    }

    const envelope = EventEnvelopeSchema.safeParse(decoded)
    if (!envelope.success) {
      return Result.err(
        new WebhookPayloadUnexpected({
          eventId: null,
          issues: toShapeIssues(envelope.error.issues),
          message: 'The webhook body is not a Bachs event envelope',
        })
      )
    }

    const { id, type, created_at: createdAt, organization_id: organizationId } = envelope.data

    if (!isBachsEvent(type)) {
      return Result.err(
        new WebhookPayloadUnexpected({
          eventId: id,
          issues: [
            { path: 'type', code: 'unrecognized_event', message: `Unknown event "${type}"` },
          ],
          message: `Bachs delivered "${type}", which this version of adonis-bachs does not model. Upgrade the package, or unsubscribe the endpoint from that event.`,
        })
      )
    }

    const payload = EventDataSchemas[type].safeParse(envelope.data.data)
    if (!payload.success) {
      return Result.err(
        new WebhookPayloadUnexpected({
          eventId: id,
          issues: toShapeIssues(payload.error.issues),
          message: `The ${type} payload did not match the documented shape`,
        })
      )
    }

    /**
     * SAFETY: `payload.data` came out of `EventDataSchemas[type]`, so it is
     * this event's payload by construction. `WebhookDelivery` is a union over
     * every event, and TypeScript cannot see that a value built from a
     * variable `type` lands in the matching member — it checks the object
     * against each member with `type` still widened to the full union.
     */
    const delivery = {
      event: type,
      id,
      organizationId: organizationId ?? null,
      createdAt: createdAt ?? null,
      payload: payload.data,
    } as WebhookDelivery

    return Result.ok(delivery)
  }
}

/**
 * Routes a delivery to its handler, falling back to `'*'`. An event with no
 * handler at all is a no-op, so subscribing to an extra event in the dashboard
 * does not break the endpoint.
 */
async function runHandler(delivery: WebhookDelivery, handlers: WebhookHandlers): Promise<void> {
  const handler = handlers[delivery.event]

  if (handler !== undefined) {
    /**
     * SAFETY: `handlers[delivery.event]` and `delivery.payload` are indexed by
     * the same event, and #parsePayload parsed the payload with that event's
     * schema, so the two agree. TypeScript cannot follow the correlation
     * across two independent indexed lookups into a mapped type.
     */
    await (handler as Handler<BachsEvent>)(delivery.payload, delivery)
    return
  }

  await handlers['*']?.(delivery.event, delivery.payload, delivery)
}

function reject(reason: string): WebhookSignatureInvalid {
  return new WebhookSignatureInvalid({
    reason,
    message: `Rejected Bachs webhook: ${reason}`,
  })
}

/**
 * Constant-time comparison. Lengths are checked first because
 * `timingSafeEqual` throws on buffers of different sizes, and a wrong-length
 * signature must be rejected, not raise.
 */
function safeEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received)
  const b = Buffer.from(expected)

  if (a.length !== b.length) {
    return false
  }

  return timingSafeEqual(a, b)
}

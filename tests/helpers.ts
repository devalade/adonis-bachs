import { createHmac } from 'node:crypto'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'

import { HttpContextFactory, RequestFactory } from '@adonisjs/core/factories/http'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Builds an HttpContext carrying a raw body and headers, the way the
 * bodyparser leaves it for a real JSON request.
 */
export function contextWithBody(rawBody: string, headers: Record<string, string> = {}): HttpContext {
  const req = new IncomingMessage(new Socket())
  req.headers = { 'content-type': 'application/json; charset=utf-8', ...headers }
  req.method = 'POST'
  req.url = '/webhooks/bachs'

  const request = new RequestFactory().merge({ req }).create()
  request.updateRawBody(rawBody)

  return new HttpContextFactory().merge({ request }).create()
}

/** Signs a body the way Bachs signs a delivery: HMAC-SHA256 of `{timestamp}.{body}`. */
export function sign(rawBody: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')
}

/**
 * A signed webhook delivery, ready to hand to `verify()` or `handle()`.
 */
export function webhookRequest(options: {
  rawBody: string
  secret: string
  /** Unix seconds. Defaults to the clock the receiver is configured with. */
  timestamp?: number
  signature?: string
  omitTimestamp?: boolean
  omitSignature?: boolean
}): HttpContext {
  const headers: Record<string, string> = {}
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000)

  if (options.omitTimestamp !== true) {
    headers['x-bachs-timestamp'] = String(timestamp)
  }

  if (options.omitSignature !== true) {
    headers['x-bachs-signature'] = options.signature ?? sign(options.rawBody, options.secret, timestamp)
  }

  return contextWithBody(options.rawBody, headers)
}

/** A webhook event envelope with the fields the receiver reads. */
export function event(type: string, data: unknown, id = 'evt_test_1') {
  return {
    id,
    type,
    created_at: '2026-02-22T16:20:00.123456+00:00',
    organization_id: 'org_abc123',
    data,
  }
}

/** A `collection.succeeded` payload that satisfies the schema. */
export function collectionSucceeded(overrides: Record<string, unknown> = {}) {
  return {
    charge_id: 'chr_1a2b3c4d5e6f',
    checkout_id: 'chk_9x8y7z6w5v',
    reference: 'pay_abc123def456',
    status: 'SUCCEEDED',
    amount: '75000.00',
    currency: 'NGN',
    settlement_amount: '74250.00',
    settlement_currency: 'NGN',
    payment_method: 'BANK_TRANSFER',
    customer: { id: 'cust_xyz789', email: 'jane@example.com', name: 'Jane Doe' },
    ...overrides,
  }
}

type ResponseSpec = {
  status: number
  body?: unknown
  headers?: Record<string, string>
  text?: string
  /** Throw instead of answering, to model a network failure or a timeout. */
  throws?: Error
}

/**
 * A fetch double. Give it responses in the order they should be returned;
 * the last one repeats once the list is exhausted.
 */
export function fakeFetch(responses: ResponseSpec[]) {
  const calls: { url: string; init: RequestInit; headers: Record<string, string> }[] = []
  let index = 0

  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url: String(input), init: init ?? {}, headers })

    const spec = responses[Math.min(index, responses.length - 1)]!
    index++

    if (spec.throws !== undefined) {
      throw spec.throws
    }

    const body = spec.text ?? (spec.body === undefined ? '' : JSON.stringify(spec.body))

    return new Response(spec.status === 204 ? null : body, {
      status: spec.status,
      headers: { 'content-type': 'application/json', ...spec.headers },
    })
  }) as unknown as typeof globalThis.fetch

  return { impl, calls }
}

/** A clock the test drives, so replay and de-duplication windows are observable. */
export function testClock(start = 1_700_000_000_000) {
  let current = start

  return {
    now: () => current,
    seconds: () => Math.floor(current / 1000),
    advance(ms: number) {
      current += ms
    },
  }
}

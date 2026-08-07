import { test } from '@japa/runner'
import { Result } from 'better-result'

import { resolveConfig } from '../src/define_config.ts'
import { WebhookPayloadUnexpected, WebhookSignatureInvalid } from '../src/failures.ts'
import { MemoryDedupeStore, WebhooksReceiver } from '../src/webhooks.ts'
import { collectionSucceeded, event, sign, testClock, webhookRequest } from './helpers.ts'

const SECRET = 'whsec_test_secret'

function receiverWith(
  overrides: Partial<Parameters<typeof resolveConfig>[0]> = {},
  clock = testClock()
) {
  const config = resolveConfig({
    apiKey: 'sk_sandbox_key',
    webhookSecret: SECRET,
    now: clock.now,
    ...overrides,
  })

  return { receiver: new WebhooksReceiver(config), clock }
}

function signedRequest(body: unknown, clock: ReturnType<typeof testClock>, secret = SECRET) {
  const rawBody = JSON.stringify(body)
  return webhookRequest({ rawBody, secret, timestamp: clock.seconds() })
}

test.group('WebhooksReceiver.verify', () => {
  test('accepts a genuine delivery and parses the payload', ({ assert }) => {
    const { receiver, clock } = receiverWith()
    const ctx = signedRequest(event('collection.succeeded', collectionSucceeded()), clock)

    const result = receiver.verify(ctx)

    assert.isTrue(Result.isOk(result))
    if (Result.isOk(result)) {
      const delivery = result.value
      assert.equal(delivery.id, 'evt_test_1')
      assert.equal(delivery.organizationId, 'org_abc123')

      /**
       * Narrowing on the event narrows the payload with it, which is the whole
       * point of the delivery being a discriminated union.
       */
      assert.equal(delivery.event, 'collection.succeeded')
      if (delivery.event === 'collection.succeeded') {
        assert.equal(delivery.payload.amount, '75000.00')
        assert.equal(delivery.payload.customer?.email, 'jane@example.com')
      }
    }
  })

  test('rejects a body whose digest does not match', ({ assert }) => {
    const { receiver, clock } = receiverWith()
    const ctx = webhookRequest({
      rawBody: JSON.stringify(event('collection.succeeded', collectionSucceeded())),
      secret: 'whsec_wrong_secret',
      timestamp: clock.seconds(),
    })

    const result = receiver.verify(ctx)

    assert.isTrue(Result.isError(result))
    assert.instanceOf(Result.isError(result) ? result.error : null, WebhookSignatureInvalid)
  })

  test('rejects a tampered body signed for different bytes', ({ assert }) => {
    const { receiver, clock } = receiverWith()
    const original = JSON.stringify(event('collection.succeeded', collectionSucceeded()))
    const tampered = JSON.stringify(
      event('collection.succeeded', collectionSucceeded({ amount: '1.00' }))
    )

    const ctx = webhookRequest({
      rawBody: tampered,
      secret: SECRET,
      timestamp: clock.seconds(),
      signature: sign(original, SECRET, clock.seconds()),
    })

    assert.isTrue(Result.isError(receiver.verify(ctx)))
  })

  test('rejects a signature of the right length but wrong content', ({ assert }) => {
    const { receiver, clock } = receiverWith()
    const rawBody = JSON.stringify(event('collection.succeeded', collectionSucceeded()))

    const ctx = webhookRequest({
      rawBody,
      secret: SECRET,
      timestamp: clock.seconds(),
      signature: 'a'.repeat(64),
    })

    assert.isTrue(Result.isError(receiver.verify(ctx)))
  })

  test('rejects a missing signature header', ({ assert }) => {
    const { receiver, clock } = receiverWith()
    const ctx = webhookRequest({
      rawBody: JSON.stringify(event('collection.succeeded', collectionSucceeded())),
      secret: SECRET,
      timestamp: clock.seconds(),
      omitSignature: true,
    })

    const result = receiver.verify(ctx)
    assert.isTrue(Result.isError(result))
    assert.include(Result.isError(result) ? result.error.message : '', 'x-bachs-signature')
  })

  test('rejects a missing timestamp header', ({ assert }) => {
    const { receiver, clock } = receiverWith()
    const ctx = webhookRequest({
      rawBody: JSON.stringify(event('collection.succeeded', collectionSucceeded())),
      secret: SECRET,
      timestamp: clock.seconds(),
      omitTimestamp: true,
    })

    const result = receiver.verify(ctx)
    assert.isTrue(Result.isError(result))
    assert.include(Result.isError(result) ? result.error.message : '', 'x-bachs-timestamp')
  })

  test('rejects an empty body', ({ assert }) => {
    const { receiver, clock } = receiverWith()
    const ctx = webhookRequest({ rawBody: '', secret: SECRET, timestamp: clock.seconds() })

    assert.isTrue(Result.isError(receiver.verify(ctx)))
  })

  test('rejects a delivery older than the tolerance, so a captured one cannot be replayed', ({
    assert,
  }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = signedRequest(event('collection.succeeded', collectionSucceeded()), clock)

    clock.advance(301 * 1000)

    const result = receiver.verify(ctx)
    assert.isTrue(Result.isError(result))
    assert.include(Result.isError(result) ? result.error.message : '', 'tolerance')
  })

  test('accepts a delivery inside the tolerance', ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = signedRequest(event('collection.succeeded', collectionSucceeded()), clock)

    clock.advance(299 * 1000)

    assert.isTrue(Result.isOk(receiver.verify(ctx)))
  })

  test('accepts either secret during a rotation', ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({ webhookSecret: ['whsec_new', 'whsec_old'] }, clock)

    for (const secret of ['whsec_new', 'whsec_old']) {
      const ctx = webhookRequest({
        rawBody: JSON.stringify(event('collection.succeeded', collectionSucceeded())),
        secret,
        timestamp: clock.seconds(),
      })

      assert.isTrue(Result.isOk(receiver.verify(ctx)))
    }
  })

  test('refuses to verify when no secret is configured', ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({ webhookSecret: undefined }, clock)
    const ctx = signedRequest(event('collection.succeeded', collectionSucceeded()), clock)

    const result = receiver.verify(ctx)
    assert.isTrue(Result.isError(result))
    assert.include(Result.isError(result) ? result.error.message : '', 'no webhook signing secret')
  })

  test('reports an unknown event rather than guessing at it', ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = signedRequest(event('something.new', {}), clock)

    const result = receiver.verify(ctx)
    assert.isTrue(Result.isError(result))
    assert.instanceOf(Result.isError(result) ? result.error : null, WebhookPayloadUnexpected)
  })

  test('reports a payload that does not match the event', ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = signedRequest(event('collection.succeeded', { nothing: true }), clock)

    const result = receiver.verify(ctx)
    assert.isTrue(Result.isError(result))
    assert.instanceOf(Result.isError(result) ? result.error : null, WebhookPayloadUnexpected)
  })

  test('reads the event name from the signed body, not from a header', ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const rawBody = JSON.stringify(event('collection.succeeded', collectionSucceeded()))
    const ctx = webhookRequest({ rawBody, secret: SECRET, timestamp: clock.seconds() })

    ctx.request.request.headers['x-bachs-event'] = 'refund.paid'

    const result = receiver.verify(ctx)
    assert.isTrue(Result.isOk(result))
    assert.equal(Result.isOk(result) ? result.value.event : null, 'collection.succeeded')
  })
})

test.group('WebhooksReceiver.handle', () => {
  test('runs the handler for the event', async ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = signedRequest(event('collection.succeeded', collectionSucceeded()), clock)

    let fulfilled: string | null = null
    await receiver.handle(ctx, {
      'collection.succeeded': async (payload) => {
        fulfilled = payload.reference ?? null
      },
    })

    assert.equal(fulfilled, 'pay_abc123def456')
    assert.equal(ctx.response.getStatus(), 200)
  })

  test('falls back to the wildcard handler', async ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = signedRequest(event('collection.succeeded', collectionSucceeded()), clock)

    let seen: string | null = null
    await receiver.handle(ctx, {
      '*': async (name) => {
        seen = name
      },
    })

    assert.equal(seen, 'collection.succeeded')
  })

  test('ignores an event with no handler', async ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = signedRequest(
      event('checkout.expired', {
        checkout_id: 'chk_1',
        status: 'expired',
        amount: '75000.00',
        currency: 'NGN',
      }),
      clock
    )

    await receiver.handle(ctx, {})

    assert.equal(ctx.response.getStatus(), 200)
  })

  test('runs the handler once when the same event is delivered twice', async ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const body = event('collection.succeeded', collectionSucceeded())

    let runs = 0
    const handlers = { 'collection.succeeded': async () => void runs++ }

    await receiver.handle(signedRequest(body, clock), handlers)
    await receiver.handle(signedRequest(body, clock), handlers)

    assert.equal(runs, 1)
  })

  test('runs again for a different event', async ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)

    let runs = 0
    const handlers = { 'collection.succeeded': async () => void runs++ }

    await receiver.handle(
      signedRequest(event('collection.succeeded', collectionSucceeded(), 'evt_1'), clock),
      handlers
    )
    await receiver.handle(
      signedRequest(event('collection.succeeded', collectionSucceeded(), 'evt_2'), clock),
      handlers
    )

    assert.equal(runs, 2)
  })

  test('runs twice when de-duplication is switched off', async ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({ dedupe: false }, clock)
    const body = event('collection.succeeded', collectionSucceeded())

    let runs = 0
    const handlers = { 'collection.succeeded': async () => void runs++ }

    await receiver.handle(signedRequest(body, clock), handlers)
    await receiver.handle(signedRequest(body, clock), handlers)

    assert.equal(runs, 2)
  })

  test('throws the failure so AdonisJS renders a 401', async ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = webhookRequest({
      rawBody: JSON.stringify(event('collection.succeeded', collectionSucceeded())),
      secret: 'whsec_wrong',
      timestamp: clock.seconds(),
    })

    await assert.rejects(async () => receiver.handle(ctx, {}))
  })

  test('lets a handler failure through, so Bachs retries the delivery', async ({ assert }) => {
    const clock = testClock()
    const { receiver } = receiverWith({}, clock)
    const ctx = signedRequest(event('collection.succeeded', collectionSucceeded()), clock)

    await assert.rejects(
      async () =>
        receiver.handle(ctx, {
          'collection.succeeded': async () => {
            throw new Error('database down')
          },
        }),
      'database down'
    )
  })
})

test.group('MemoryDedupeStore', () => {
  test('forgets an entry once its window passes', ({ assert }) => {
    const clock = testClock()
    const store = new MemoryDedupeStore(clock.now, 1000)

    store.remember('evt_1')
    assert.isTrue(store.seen('evt_1'))

    clock.advance(1001)
    assert.isFalse(store.seen('evt_1'))
  })
})

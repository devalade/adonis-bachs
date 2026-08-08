# Bachs Integration Reference

Concise examples and failure guidance for `@devalade/adonis-bachs` in an
AdonisJS 7 app. Read this only when implementing a step from `SKILL.md`.

## Install & configure

```sh
npm i @devalade/adonis-bachs
node ace configure @devalade/adonis-bachs
```

Answer "Scaffold durable webhook processing with Lucid?" = yes only for
multi-process production. `configure` writes `config/bachs.ts`, the webhook
controller, env validations, and registers the provider + commands. Rerunning it
publishes the missing Lucid files for an already-configured app.

`config/bachs.ts`:

```ts
import env from '#start/env'
import { defineConfig } from '@devalade/adonis-bachs'

export default defineConfig({
  apiKey: env.get('BACHS_API_KEY'),
  webhookSecret: env.get('BACHS_WEBHOOK_SECRET'),
})
```

The environment follows the key prefix: `sk_sandbox_` → sandbox, `sk_live_` →
production. Setting `environment` in config makes a mismatched key a startup
error instead of a 401 or an accidental live charge.

## Checkout (stable reference + idempotency)

```ts
import bachs from '@devalade/adonis-bachs/services/main'

export default class CheckoutController {
  async store({ request, response }: HttpContext) {
    const session = await bachs.checkout.create(
      {
        customer: { email: 'ada@example.com', name: 'Ada Lovelace' },
        product_cart: [{ product_id: 'prod_abc', quantity: 1 }],
        success_url: 'https://shop.example.com/thanks',
        cancel_url: 'https://shop.example.com/cart',
        reference: `order_${order.id}`,
      },
      { idempotencyKey: `order_${order.id}` }
    )
    return response.redirect(session.checkout_url)
  }
}
```

The `reference` must be stable and application-owned (e.g. `order_${order.id}`),
not a fresh UUID, or the webhook handler cannot map it back to your order. The
same value as `idempotencyKey` makes retries return Bachs' cached response
instead of charging again, surviving process restarts.

## Webhook controller and no-CSRF route

```ts
// app/controllers/bachs_webhooks_controller.ts
async handle(ctx: HttpContext) {
  await bachs.webhooks.handle(ctx, {
    'collection.succeeded': async (payload) => {
      await orders.markPaid(payload.reference, payload.amount, payload.currency)
    },
    'collection.failed': async () => {
      // leave the order unfulfilled
    },
    'customer.subscription.created': async (payload) => {
      await access.grant(payload.id)
    },
    'customer.subscription.deleted': async (payload) => {
      await access.revoke(payload.id)
    },
    'refund.paid': async (payload) => {
      await access.revokeByRefund(payload)
    },
  })
}
```

```ts
// start/routes.ts — Bachs cannot carry your CSRF token
router.post('/webhooks/bachs', [BachsWebhooksController])
```

When CSRF is applied globally, opt the route out
(`router.post(...).use(middleware.noCsrf())`). The handler is awaited; throwing
yields a non-2xx so Bachs retries, and the dedupe claim is released so the
retry runs again. Keep handlers short — push slow work onto a queue.

## Verifying setup

```sh
node ace bachs:check
```

Prints the environment and connected organization, lists the first product, and
warns when the key is live.

## Errors and retries

Failures are `better-result` tagged errors carrying Bachs' stable `errorCode`,
the `x-request-id` to quote at support, and a `detail` string. Each class has an
`.is()` guard and `.status` / `.code`, so an unhandled one renders its own HTTP
response:

```ts
import { BachsValidationFailed, BachsRateLimited } from '@devalade/adonis-bachs'

try {
  await bachs.products.create(payload)
} catch (error) {
  if (BachsValidationFailed.is(error)) {
    return response.unprocessableEntity({ errors: error.errors }) // [{ field, message, type }]
  }
  if (BachsRateLimited.is(error)) {
    return response.tooManyRequests({ retryAfter: error.retryAfter })
  }
  throw error
}
```

Idempotency is the retry guarantee. Mint a key once per logical operation and
reuse it across that call's retries:

```ts
await bachs.payouts.createWithdrawal(payload, { idempotencyKey: `payout_${batch}_${row}` })
```

## Failure and edge-case guidance

- **Replays.** `handle` checks an HMAC-SHA256 signature over
  `{timestamp}.{raw_body}` and rejects deliveries outside the configured
  tolerance window (default 300s), so a captured delivery cannot be replayed
  later. The event name is read from the signed body, not a spoofable header.
- **Raw body matters.** AdonisJS' bodyparser keeps raw bytes, so no extra config
  is needed — but re-serialising `request.body()` changes the bytes and every
  signature fails. Never do that before `handle`.
- **Missing signature/secret.** No signing secret configured → `handle` throws a
  401-shaped `WebhookSignatureInvalid`. Set `BACHS_WEBHOOK_SECRET`.
- **Unknown event.** A delivery of an event this package version does not model
  is rejected with `WebhookPayloadUnexpected` — upgrade the package or
  unsubscribe the endpoint from that event.
- **Event with no handler** is a safe no-op; subscribing to an extra event in
  the portal does not break the endpoint.
- **Duplicates.** Dedupe is keyed on the event ID (`evt_…`). The in-memory store
  covers one process only; a multi-process app must use the Lucid inbox or a
  shared store, because Bachs may deliver the same event to any process.
- **Retries.** A handler that throws produces a non-2xx; Bachs retries and the
  claim is released. An event you half-processed then retried is harder to
  reason about than one you queued atomically.
- **Success URL proves nothing.** Anyone can visit it. Fulfil only in the
  verified `collection.succeeded` handler.
- **Subscriptions** are created by completing a checkout for a recurring
  product. There is no create-subscription endpoint, so neither is there one
  here. Drive access from `customer.subscription.*` events.
- **Money** is a decimal string (`"29.00"`) with an ISO 4217 currency. No minor
  units, no floats.
- **Secret rotation.** Rotation takes effect on Bachs' side immediately; deploy
  both secrets first. Every configured secret is tried:

```ts
webhookSecret: [env.get('BACHS_WEBHOOK_SECRET'), env.get('BACHS_WEBHOOK_SECRET_PREVIOUS')]
```

## Durable Lucid inbox

For multi-process production, accept the Lucid scaffold at configure time (or
rerun configure for an existing app). It generates the migration, an
`app/services/bachs_webhook_store.ts`, and wires `config/bachs.ts` to it; or set
`dedupe: new BachsWebhookStore()` manually. The store atomically claims each
verified delivery, records payload/metadata/attempt count, marks completion only
after the handler succeeds, and leaves a retryable row on failure. Five-minute
processing leases recover abandoned deliveries; completed IDs stay deduplicated
for six hours. Then run `node ace migration:run`.

This table is webhook-delivery infrastructure — NOT your payment model. Your
orders, payments, subscriptions, and fulfilment relationships remain yours.

## Pagination

`list` returns one page; `all` walks every page as an async iterable, following
cursors where Bachs offers them and offsets where it does not:

```ts
const page = await bachs.customers.list({ limit: 50, search: 'ada' })
for await (const customer of bachs.customers.all()) {
  await sync(customer)
}
```

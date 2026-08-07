# @devalade/adonis-bachs

Bachs payments for AdonisJS: hosted checkout, subscriptions, refunds, payouts, and
signed webhooks — typed end to end, with the whole API surface generated from
Bachs' own OpenAPI document.

```sh
npm i @devalade/adonis-bachs
node ace configure @devalade/adonis-bachs
```

`configure` writes `config/bachs.ts`, scaffolds a webhook controller, registers the
provider, and adds `BACHS_API_KEY` and `BACHS_WEBHOOK_SECRET` to your env schema.

## Take a payment

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

Then fulfil the order from the webhook, never from the redirect:

```ts
// app/controllers/bachs_webhooks_controller.ts
async handle(ctx: HttpContext) {
  await bachs.webhooks.handle(ctx, {
    'collection.succeeded': async (payload) => {
      await orders.markPaid(payload.reference, payload.amount, payload.currency)
    },
    'customer.subscription.deleted': async (payload) => {
      await access.revoke(payload.id)
    },
  })
}
```

```ts
// start/routes.ts — Bachs cannot carry your CSRF token
router.post('/webhooks/bachs', [BachsWebhooksController])
```

The handler is awaited. Throwing from it produces a non-2xx, which makes Bachs retry
the delivery — so keep it short and push slow work onto a queue.

## What this package decides for you

**Webhooks are the source of truth.** A customer who closes the tab before the
redirect still paid, and anyone can visit your success URL. `handle` verifies the
HMAC-SHA256 signature over `{timestamp}.{raw body}`, rejects deliveries outside a
300-second window so a captured request cannot be replayed, reads the event name from
the *signed* body rather than a spoofable header, and skips events it has already
processed. Nothing reaches your handler until all of that passes.

**Retries cannot double-charge.** Every write carries an `Idempotency-Key`, minted
once per call and reused across that call's own retries, so a timeout followed by a
retry returns Bachs' cached response instead of charging again. Pass your own key to
extend the guarantee across process restarts:

```ts
await bachs.payouts.createWithdrawal(payload, { idempotencyKey: `payout_${batch}_${row}` })
```

**Going live is a key swap.** The environment follows the API key prefix —
`sk_sandbox_` reaches the sandbox, `sk_live_` reaches production. State
`environment` in your config and a mismatched key becomes a startup error rather
than a confusing 401, or a live charge you did not mean to make.

**Money is never a number.** Bachs sends decimal strings (`"29.00"`) with an ISO 4217
currency, and this package keeps them that way. There are no minor units to convert
and nothing here is safe to do float arithmetic on.

**Secrets stay out of logs.** The API key and signing secrets are wrapped so they are
absent from `console.log`, `util.inspect`, `JSON.stringify`, and every error this
package raises.

## Errors

Every expected failure is a `better-result` tagged error carrying Bachs' stable
`errorCode`, the `x-request-id` to quote at their support, and the `detail` string.
Each class brings its own `.is()` guard, which narrows the type:

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

`.is()` is `instanceof` underneath, so use whichever reads better — this form just
matches the rest of `better-result`.

When you want the compiler to hold you to every case, match on the tag instead. Add a
failure to the union and `matchError` stops compiling until you handle it:

```ts
import { matchErrorPartial } from 'better-result'

const body = matchErrorPartial(
  error,
  {
    BachsValidationFailed: (failure) => ({ status: 422, errors: failure.errors }),
    BachsRateLimited: (failure) => ({ status: 429, retryAfter: failure.retryAfter }),
    BachsUnauthorized: () => ({ status: 401, message: 'Check BACHS_API_KEY' }),
  },
  () => null // anything you did not name lands here
)

if (body === null) throw error
return response.status(body.status).send(body)
```

Failures also carry `status` and `code`, so leaving one unhandled lets AdonisJS'
exception handler render the right HTTP response on its own.

Prefer branching to catching? `bachs.client` exposes the same calls returning
`Result<T, BachsApiFailure>` instead of throwing:

```ts
const result = await bachs.client.get('/v1/products', { operation: 'listProducts', schema })

if (Result.isError(result)) {
  // result.error is the BachsApiFailure union, narrowable by tag or by .is()
}
```

## Pagination

`list` returns one page. `all` walks every page as an async iterable, following
cursors where Bachs offers them and counting offsets where it does not.

```ts
const page = await bachs.customers.list({ limit: 50, search: 'ada' })

for await (const customer of bachs.customers.all()) {
  await sync(customer)
}
```

## Rotating a webhook secret

Rotation takes effect on Bachs' side immediately, so deploy both secrets first:

```ts
webhookSecret: [env.get('BACHS_WEBHOOK_SECRET'), env.get('BACHS_WEBHOOK_SECRET_PREVIOUS')]
```

Every configured secret is tried, so no delivery is dropped mid-rotation.

## Running several processes

De-duplication defaults to an in-memory store, which only covers one process. Behind a
load balancer, give it somewhere shared:

```ts
defineConfig({
  apiKey: env.get('BACHS_API_KEY'),
  dedupe: {
    async seen(eventId) { return (await redis.exists(`bachs:${eventId}`)) === 1 },
    async remember(eventId) { await redis.setex(`bachs:${eventId}`, 21_600, '1') },
  },
})
```

## API surface

`checkout`, `customers`, `products`, `productGroups`, `subscriptions`, `payments`,
`refunds`, `disputes`, `payouts`, `conversions`, `accounts`, `organizations`, `media`,
`webhooks`, `currencies` — all 78 documented endpoints.

Subscriptions are created by completing a checkout for a recurring product; Bachs has
no create-subscription endpoint, so neither does this package.

## Verify your setup

```sh
node ace bachs:check
```

Prints the environment, confirms the key reaches your organization, and warns you when
the key is live.

## Types

Types come from `resources/openapi.json` via `npm run generate:schemas`. A field is
optional here exactly when Bachs' specification does not mark it required — where they
document no required set for a response, every field parses as optional. That is
deliberate: a parser that rejects a genuine payment is worse than a field you have to
check. Webhook payload schemas are hand-written from the event reference and verified
against every documented example.

To track an API update, replace the vendored spec, re-run the generator, and review the
diff.

## License

MIT

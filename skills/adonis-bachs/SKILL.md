---
name: adonis-bachs
description: Installs, configures, and implements Bachs payments for AdonisJS using @devalade/adonis-bachs. Use when installing or configuring the package, or implementing Bachs checkout, payments, subscriptions, signed webhooks, durable webhook processing, refunds, or payouts.
---

Guides installing and wiring `@devalade/adonis-bachs` into an AdonisJS app and
implementing checkout, subscriptions, refunds, payouts, and signed webhooks.
Bachs webhooks are the source of truth for money movement.

## Boundaries
- Orders, payments, subscriptions, and fulfilment state are YOUR application's
  schema. Never invent, scaffold, or migrate a payment-model table. Only the
  optional webhook inbox is package-owned.
- Money is a decimal string with an ISO 4217 currency. Never treat it as a
  number or do float arithmetic on it.
- Never log, print, commit, or expose API keys or signing secrets.

## Workflow
Each step lists completion criteria; do not move on until they pass.
### 1. Inspect the target app
Read `package.json`, `adonisrc.ts`, `start/routes.ts`, `start/env.ts`,
`app/controllers/`, `.env(.example)`, and `database/` before touching anything.
- [ ] Know the AdonisJS major version (7 required) and file layout
- [ ] Know whether `@adonisjs/lucid` is installed and configured
- [ ] Know whether CSRF is applied globally
### 2. Install and configure
```sh
npm i @devalade/adonis-bachs
node ace configure @devalade/adonis-bachs
```
Answer "Scaffold durable webhook processing with Lucid?" = yes only for
multi-process production. `configure` writes `config/bachs.ts`, the webhook
controller, env validations, and registers provider + commands.
- [ ] `config/bachs.ts` exists (defineConfig + env.get)
- [ ] `app/controllers/bachs_webhooks_controller.ts` exists
- [ ] `adonisrc.ts` registers `bachs_provider` and `/commands`
- [ ] `start/env.ts` validates `BACHS_API_KEY` and `BACHS_WEBHOOK_SECRET`
### 3. Collect credentials without exposing secrets
From the Bachs developer portal: a sandbox `sk_sandbox_…` API key and the
webhook signing secret; have the user put them in gitignored `.env`. Never echo
values back, paste them into code/logs, or add them to `.env.example`.
- [ ] `BACHS_API_KEY` and `BACHS_WEBHOOK_SECRET` live only in `.env`
- [ ] No secret was echoed, logged, or committed
### 4. Verify with bachs:check
```sh
node ace bachs:check
```
- [ ] Prints `Environment: sandbox` and `Connected to <org>`
- [ ] `BachsUnauthorized` → fix key (sandbox/live mismatch); `BachsForbidden` →
      grant read scopes. A `production` warning = live key; stay sandbox unless go-live.
### 5. Create checkout with stable reference + idempotency key
Pass an application-owned stable reference (e.g. `order_${order.id}`) as both
`reference` and `idempotencyKey`, then redirect to `checkout_url`. Never
fulfill here — anyone can visit a success URL.
- [ ] `reference` is stable and application-owned, not a per-request UUID
- [ ] Same value passed as `idempotencyKey`
- [ ] Response redirects to `checkout_url`; no fulfilment in this route
### 6. Register a no-CSRF webhook route
Bachs cannot carry a CSRF token. In `start/routes.ts` register the controller
without CSRF (opt out with `middleware.noCsrf()` when CSRF is global).
- [ ] `router.post('/webhooks/bachs', [BachsWebhooksController])` exists
- [ ] Route is explicitly exempt when CSRF middleware is global
### 7. Fulfil only from verified `collection.succeeded`
Handle events with `bachs.webhooks.handle(ctx, handlers)`; only it passes
signature, replay-window, and dedupe checks. Fulfil on `collection.succeeded`,
leave orders unfulfilled on `collection.failed`. Keep handlers short — a throw
yields non-2xx and Bachs retries, so queue slow work.
- [ ] All fulfilment lives in the `collection.succeeded` handler, keyed on the
      supplied reference
- [ ] Slow work is queued; unhandled events are safe no-ops
### 8. Optional Lucid inbox for multi-process production
The default in-memory dedupe store covers one process only. For several
processes, rerun `configure` accepting the Lucid scaffold (migration +
`BachsWebhookStore`), or set `dedupe: new BachsWebhookStore()` manually.
- [ ] Inbox chosen iff multi-process production
- [ ] `config/bachs.ts` uses the durable store
### 9. Run migrations
```sh
node ace migration:run
```
- [ ] Migrations succeed (webhook inbox table only, if chosen)
### 10. Test in sandbox
Drive a real sandbox checkout and verify: success fulfils only via the verified
webhook; a failed payment leaves the order unfulfilled; duplicates are answered
200 but handled once; a throwing handler is retried and recovers; forged or
expired signatures are rejected; direct hits on the success URL do not fulfil.
- [ ] Success fulfilled only after the verified webhook
- [ ] `collection.failed` leaves the order unfulfilled
- [ ] Duplicates handled once; retries recover
- [ ] Forged/expired signatures rejected with 401
### 11. Production checklist
- [ ] Live `sk_live_…` key in `.env` (environment follows the key prefix)
- [ ] Webhook endpoint configured in the portal; secret set
- [ ] Dedupe store and webhook tolerance match production topology
- [ ] No secrets committed, logged, or exposed to the browser
- [ ] Money stays as decimal strings; no float arithmetic

## Implementation details
Code examples, edge cases, and failure guidance: see `REFERENCE.md`.

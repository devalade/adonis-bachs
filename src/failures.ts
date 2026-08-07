import { TaggedError } from 'better-result'
import type { $ZodIssue } from 'zod/v4/core'

/**
 * A safe description of one place where a response or payload did not match
 * the documented shape. It carries the field path and the type-level reason,
 * never the received value, so a failure can be logged without leaking
 * customer data out of a payload.
 */
export type ShapeIssue = {
  readonly path: string
  readonly code: string
  readonly message: string
}

/**
 * Projects parser issues into safe telemetry fields.
 */
export function toShapeIssues(issues: ReadonlyArray<$ZodIssue>): ReadonlyArray<ShapeIssue> {
  return issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    code: issue.code,
    message: issue.message,
  }))
}

/**
 * One field Bachs rejected, as sent, so a caller can surface the message next
 * to the right form input.
 */
export type FieldError = {
  readonly field: string
  readonly message: string
  readonly type: string
}

/**
 * The stable `error_code` values Bachs documents. Branch on these rather than
 * on `detail`, which is prose and may be reworded at any time.
 *
 * The union stays open to unrecognised strings: Bachs can ship a new code
 * before this package knows about it, and a payment integration must not stop
 * compiling because of that.
 */
export type BachsErrorCode =
  | 'BAD_GATEWAY'
  | 'BAD_REQUEST'
  | 'BASE_CURRENCY_NOT_HELD_BY_ORG'
  | 'BASE_CURRENCY_NOT_PLATFORM_SUPPORTED'
  | 'CARD_TOKEN_INVALID'
  | 'CARD_VAULT_UNAVAILABLE'
  | 'CART_CURRENCY_MISMATCH'
  | 'CHECKOUT_ERROR'
  | 'CHECKOUT_PRICE_CHANGED'
  | 'CONFLICT'
  | 'CUSTOM_AMOUNT_REQUIRED'
  | 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED'
  | 'DEPOSIT_LIMIT_EXCEEDED'
  | 'DUPLICATE_CURRENCY'
  | 'ENVIRONMENT_MISMATCH'
  | 'FIXED_AMOUNT_OVERRIDE_NOT_ALLOWED'
  | 'FORBIDDEN'
  | 'GATEWAY_UNAVAILABLE'
  | 'HETEROGENEOUS_PRICE_TYPES'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IMMUTABLE_FIELD'
  | 'INTERNAL_SERVER_ERROR'
  | 'INTERVAL_NOT_ALLOWED'
  | 'INTERVAL_REQUIRED'
  | 'INVALID_INTERVAL'
  | 'INVALID_PRODUCT_REFERENCE'
  | 'INVALID_SUBSCRIPTION_PRICE'
  | 'INVALID_UPLOAD_REFERENCE'
  | 'MEDIA_LIMIT_EXCEEDED'
  | 'METADATA_LIMIT_EXCEEDED'
  | 'MINIMUM_PRICE_REQUIRED'
  | 'NGN_SUBSCRIPTIONS_NOT_ENABLED'
  | 'NOT_FOUND'
  | 'NOT_IMPLEMENTED'
  | 'OFF_SESSION_CHARGE_FAILED'
  | 'OFF_SESSION_NOT_SUPPORTED'
  | 'PAYMENTS_NOT_ENABLED'
  | 'PAYMENT_ERROR'
  | 'PAYMENT_METHOD_NOT_ALLOWED'
  | 'PAYMENT_METHOD_NOT_ENABLED'
  | 'PAYMENT_METHOD_SETUP_FAILED'
  | 'PAYOUTS_NOT_ENABLED'
  | 'PLAN_NOT_PRICED_IN_CURRENCY'
  | 'PRECONDITION_REQUIRED'
  | 'PRICE_REQUIRED'
  | 'PRODUCT_ARCHIVED'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_NO_PRICE'
  | 'PRORATION_BEHAVIOR_NOT_SUPPORTED'
  | 'PROVIDER_ERROR'
  | 'QUOTE_ERROR'
  | 'RECURRING_INTERVAL_IMMUTABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'SUBSCRIPTIONS_NOT_ENABLED'
  | 'SUBSCRIPTION_ALREADY_CANCELED'
  | 'SUBSCRIPTION_METHOD_NOT_SUPPORTED'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'SUBSCRIPTION_NOT_MODIFIABLE'
  | 'SUBSCRIPTION_NOT_TRIALING'
  | 'SUBSCRIPTION_PLAN_INTERVAL_MISMATCH'
  | 'SUBSCRIPTION_PRICE_NOT_RECURRING'
  | 'SUBSCRIPTION_REQUIRES_CATALOG_PRODUCT'
  | 'TOO_MANY_REQUESTS'
  | 'TOTP_STEP_UP_REQUIRED'
  | 'TRIALS_NOT_ENABLED'
  | 'TRIAL_REQUIRES_RECURRING'
  | 'UNAUTHORIZED'
  | 'UNSUPPORTED_CURRENCY'
  | 'UNSUPPORTED_DEPOSIT_CURRENCY'
  | 'VALIDATION_ERROR'
  | 'VALIDATION_FAILED'
  | 'WITHDRAWAL_LIMIT_EXCEEDED'
  | (string & {})

/**
 * Fields every API failure carries. `requestId` is the `x-request-id` Bachs
 * returns on every response — quote it when you contact their support, and log
 * it next to your own order ID so a failed payment can be traced end to end.
 */
type ApiFailureFields = {
  /** Names the call, e.g. `createCheckoutSession`. */
  readonly operation: string
  readonly errorCode: BachsErrorCode | null
  readonly requestId: string | null
  /** Bachs' own `detail` string, when it sent one. */
  readonly detail: string | null
  /** Link to this code's entry in the Bachs error reference. */
  readonly docUrl: string | null
  readonly message: string
}

/**
 * The request never produced a classified HTTP response: the network failed,
 * the deadline elapsed, or Bachs answered with a status this package does not
 * model.
 */
export class BachsRequestFailed extends TaggedError('BachsRequestFailed')<
  ApiFailureFields & {
    readonly responseStatus: number | null
    readonly cause: unknown
  }
> {
  readonly code = 'E_BACHS_REQUEST'
  readonly status = 500
}

/**
 * Bachs rejected the API key: it is missing, malformed, revoked, or belongs to
 * the other environment. A `sk_sandbox_` key sent to `api.bachs.io` lands
 * here.
 */
export class BachsUnauthorized extends TaggedError('BachsUnauthorized')<ApiFailureFields> {
  readonly code = 'E_BACHS_UNAUTHORIZED'
  readonly status = 401
}

/**
 * The key is valid but lacks the scope this call needs, e.g. `products:write`.
 * Fix it on the key in the developer portal, not in your code.
 */
export class BachsForbidden extends TaggedError('BachsForbidden')<ApiFailureFields> {
  readonly code = 'E_BACHS_FORBIDDEN'
  readonly status = 403
}

/**
 * The resource does not exist, or belongs to another organization or the other
 * environment.
 */
export class BachsNotFound extends TaggedError('BachsNotFound')<ApiFailureFields> {
  readonly code = 'E_BACHS_NOT_FOUND'
  readonly status = 404
}

/**
 * The request conflicts with current state. `IDEMPOTENCY_CONFLICT` means an
 * `Idempotency-Key` was reused with a different body — generate a new key
 * rather than retrying this one.
 */
export class BachsConflict extends TaggedError('BachsConflict')<ApiFailureFields> {
  readonly code = 'E_BACHS_CONFLICT'
  readonly status = 409
}

/**
 * Bachs rejected the payload. `errors` holds its field errors as sent, so a
 * caller can surface them next to their own form fields.
 */
export class BachsValidationFailed extends TaggedError('BachsValidationFailed')<
  ApiFailureFields & {
    readonly errors: ReadonlyArray<FieldError>
    /** Structured context on limit errors, e.g. `requested_amount`. */
    readonly details: Readonly<Record<string, unknown>> | null
  }
> {
  readonly code = 'E_BACHS_VALIDATION'
  readonly status = 422
}

/**
 * A precondition is missing. `TOTP_STEP_UP_REQUIRED` is the common case: the
 * action needs a fresh two-factor step-up that an API key cannot satisfy.
 */
export class BachsPreconditionRequired extends TaggedError(
  'BachsPreconditionRequired'
)<ApiFailureFields> {
  readonly code = 'E_BACHS_PRECONDITION'
  readonly status = 428
}

/**
 * The API key exhausted its request budget. `retryAfter` is the number of
 * seconds Bachs asked us to wait; `resetAt` is when the window rolls over.
 */
export class BachsRateLimited extends TaggedError('BachsRateLimited')<
  ApiFailureFields & {
    readonly retryAfter: number | null
    /** Unix seconds, from `X-RateLimit-Reset`. */
    readonly resetAt: number | null
  }
> {
  readonly code = 'E_BACHS_RATE_LIMIT'
  readonly status = 429
}

/**
 * Bachs answered successfully but the body did not match the documented shape,
 * so no trustworthy value could be built from it.
 *
 * Failing here is deliberate. Handing a half-parsed object to application code
 * that the types promise is complete turns one upstream change into a class of
 * `undefined` bugs far from their cause.
 */
export class BachsResponseUnexpected extends TaggedError('BachsResponseUnexpected')<{
  readonly operation: string
  readonly requestId: string | null
  readonly issues: ReadonlyArray<ShapeIssue>
  readonly message: string
}> {
  readonly code = 'E_BACHS_RESPONSE'
  readonly status = 502
}

/**
 * A request on the webhook endpoint did not carry a signature that verifies
 * against the endpoint's signing secret, so it cannot be treated as coming
 * from Bachs.
 */
export class WebhookSignatureInvalid extends TaggedError('WebhookSignatureInvalid')<{
  readonly reason: string
  readonly message: string
}> {
  readonly code = 'E_BACHS_INVALID_SIGNATURE'
  readonly status = 401
}

/**
 * The signature verified, but the body was not an event payload this package
 * recognises.
 */
export class WebhookPayloadUnexpected extends TaggedError('WebhookPayloadUnexpected')<{
  readonly eventId: string | null
  readonly issues: ReadonlyArray<ShapeIssue>
  readonly message: string
}> {
  readonly code = 'E_BACHS_EVENT_PAYLOAD'
  readonly status = 400
}

/**
 * Every expected failure a call to the Bachs API can produce.
 */
export type BachsApiFailure =
  | BachsRequestFailed
  | BachsUnauthorized
  | BachsForbidden
  | BachsNotFound
  | BachsConflict
  | BachsValidationFailed
  | BachsPreconditionRequired
  | BachsRateLimited
  | BachsResponseUnexpected

/**
 * Every expected failure receiving a webhook delivery can produce.
 */
export type WebhookFailure = WebhookSignatureInvalid | WebhookPayloadUnexpected

/**
 * Any expected failure this package produces.
 */
export type BachsFailure = BachsApiFailure | WebhookFailure

/**
 * Recognises this package's failures among arbitrary caught values.
 */
export function isBachsFailure(value: unknown): value is BachsFailure {
  return (
    value instanceof BachsRequestFailed ||
    value instanceof BachsUnauthorized ||
    value instanceof BachsForbidden ||
    value instanceof BachsNotFound ||
    value instanceof BachsConflict ||
    value instanceof BachsValidationFailed ||
    value instanceof BachsPreconditionRequired ||
    value instanceof BachsRateLimited ||
    value instanceof BachsResponseUnexpected ||
    value instanceof WebhookSignatureInvalid ||
    value instanceof WebhookPayloadUnexpected
  )
}

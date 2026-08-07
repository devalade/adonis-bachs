import { Result } from 'better-result'
import { z } from 'zod'
import type { HttpContext } from '@adonisjs/core/http'

import { BachsClient, pageOf, type Page, type QueryParams } from './client.ts'
import {
  resolveConfig,
  type BachsConfig,
  type BachsEnvironment,
  type ResolvedBachsConfig,
} from './define_config.ts'
import type { BachsApiFailure } from './failures.ts'
import { paginate } from './pagination.ts'
import { WebhooksReceiver, type WebhookDelivery, type WebhookHandlers } from './webhooks.ts'
import * as api from './schemas.ts'

/**
 * Unwraps a result at the AdonisJS-facing seam, throwing the failure so the
 * framework's exception handler renders it with the right status.
 *
 * @template T - The success value.
 */
function orThrow<T>(result: Result<T, BachsApiFailure>): T {
  if (Result.isError(result)) {
    throw result.error
  }

  return result.value
}

/** URL-encodes a path segment so an ID with a slash cannot rewrite the route. */
function segment(value: string): string {
  return encodeURIComponent(value)
}

/** Options every write accepts. */
export type WriteOptions = {
  /**
   * Ties this write to one of your own business operations, so a retry after a
   * timeout returns the original response instead of acting twice. Use a value
   * that names the operation — an order ID — not a fresh UUID per attempt.
   */
  readonly idempotencyKey?: string
}

/**
 * The Bachs API, wired for AdonisJS.
 *
 * Every method throws its expected failure rather than returning it, because
 * that is what AdonisJS controllers expect: the failures carry `status` and
 * `code`, so the framework's exception handler turns them into the right HTTP
 * response. {@link Bachs.client} exposes the same calls as typed results for
 * callers who would rather branch than catch.
 *
 * ```ts
 * import bachs from '@devalade/adonis-bachs/services/main'
 *
 * const session = await bachs.checkout.create({
 *   customer: { email: 'ada@example.com', name: 'Ada Lovelace' },
 *   product_cart: [{ product_id: 'prod_abc', quantity: 1 }],
 *   success_url: 'https://shop.example.com/thanks',
 * })
 *
 * return response.redirect(session.checkout_url)
 * ```
 */
export class Bachs {
  readonly #client: BachsClient
  readonly #config: ResolvedBachsConfig

  /**
   * The underlying HTTP adapter. Its methods return typed results instead of
   * throwing, and it reaches endpoints this facade does not wrap.
   */
  get client(): BachsClient {
    return this.#client
  }

  /** Which environment this instance talks to, decided by the API key. */
  get environment(): BachsEnvironment {
    return this.#config.environment
  }

  constructor(config: BachsConfig) {
    this.#config = resolveConfig(config)
    this.#client = new BachsClient(this.#config)
    this.#receiver = new WebhooksReceiver(this.#config)
  }

  readonly #receiver: WebhooksReceiver

  /*
  |--------------------------------------------------------------------------
  | Checkout
  |--------------------------------------------------------------------------
  */

  /**
   * Creating and reading checkout sessions.
   *
   * A checkout session is how every payment starts, subscriptions included:
   * there is no create-subscription endpoint, a subscription is what a
   * completed checkout for a recurring product leaves behind.
   */
  readonly checkout = {
    /**
     * Creates a checkout session and returns it with the URL to send the
     * customer to.
     *
     * Pass exactly one of `product_cart` (catalog products) or `pricing` (a
     * raw amount). The payload is checked here, so that mistake surfaces as a
     * local error rather than a 400 round trip.
     *
     * Treat the `collection.succeeded` webhook as the moment the money is
     * real. The customer may close the tab before your success URL loads, and
     * anyone can visit that URL directly.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails, or a
     * `ZodError` when the payload is malformed.
     */
    create: async (
      payload: api.CreateCheckoutSessionRequest,
      options: WriteOptions = {}
    ): Promise<api.CreateCheckoutSessionResponse> =>
      orThrow(
        await this.#client.post('/v1/checkout-sessions', {
          operation: 'createCheckoutSession',
          schema: api.CreateCheckoutSessionResponseSchema,
          body: api.CreateCheckoutSessionRequestSchema.parse(payload),
          idempotencyKey: options.idempotencyKey,
        })
      ),

    /**
     * Retrieves a checkout session, with its resolved line items and charge.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    get: async (checkoutId: string): Promise<api.CheckoutSessionApiResponse> =>
      orThrow(
        await this.#client.get(`/v1/checkout-sessions/${segment(checkoutId)}`, {
          operation: 'getCheckoutSession',
          schema: api.CheckoutSessionApiResponseSchema,
        })
      ),

    /**
     * Retrieves the public checkout record behind a session.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    getCheckout: async (checkoutId: string): Promise<api.CheckoutResponse> =>
      orThrow(
        await this.#client.get(`/v1/checkouts/${segment(checkoutId)}`, {
          operation: 'getCheckout',
          schema: api.CheckoutResponseSchema,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Customers
  |--------------------------------------------------------------------------
  */

  /** The buyers you bill, and their saved payment methods. */
  readonly customers = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    create: async (
      payload: api.CreateCustomerRequest,
      options: WriteOptions = {}
    ): Promise<api.CustomerDetailResponse> =>
      orThrow(
        await this.#client.post('/v1/customers', {
          operation: 'createCustomer',
          schema: api.CustomerDetailResponseSchema,
          body: payload,
          idempotencyKey: options.idempotencyKey,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (customerId: string): Promise<api.CustomerDetailResponse> =>
      orThrow(
        await this.#client.get(`/v1/customers/${segment(customerId)}`, {
          operation: 'getCustomer',
          schema: api.CustomerDetailResponseSchema,
        })
      ),

    /** Only the fields you send are changed. @throws {Error} A {@link BachsApiFailure} when the call fails. */
    update: async (
      customerId: string,
      payload: api.UpdateCustomerRequest
    ): Promise<api.CustomerDetailResponse> =>
      orThrow(
        await this.#client.patch(`/v1/customers/${segment(customerId)}`, {
          operation: 'updateCustomer',
          schema: api.CustomerDetailResponseSchema,
          body: payload,
        })
      ),

    /**
     * One page of customers, newest first. Pass `search` to match on email or
     * name.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    list: async (params: api.ListCustomersParams = {}): Promise<Page<api.CustomerListItem>> =>
      orThrow(
        await this.#client.get('/v1/customers', {
          operation: 'listCustomers',
          schema: pageOf(api.CustomerListItemSchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListCustomersParams = {}): AsyncIterable<api.CustomerListItem> =>
      paginate(
        this.#client,
        '/v1/customers',
        'listCustomers',
        api.CustomerListItemSchema,
        params as QueryParams
      ),

    /**
     * Mints a pre-authenticated customer portal session, where the customer
     * manages their own subscriptions, invoices and cards.
     *
     * The returned URL carries the session credential: redirect to it, and do
     * not log it or put it in an email. Sessions are short-lived, so create a
     * fresh one each time a customer asks to manage their billing.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    createPortalSession: async (customerId: string): Promise<api.PortalSessionResponse> =>
      orThrow(
        await this.#client.post(`/v1/customers/${segment(customerId)}/portal-sessions`, {
          operation: 'createCustomerPortalSession',
          schema: api.PortalSessionResponseSchema,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Products
  |--------------------------------------------------------------------------
  */

  /**
   * Your billing catalogue. A product carries its own price; adding a
   * `billing_cycle` is what makes it recurring.
   */
  readonly products = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    create: async (
      payload: api.CreateProductRequest,
      options: WriteOptions = {}
    ): Promise<api.ProductResponse> =>
      orThrow(
        await this.#client.post('/v1/products', {
          operation: 'createProduct',
          schema: api.ProductResponseSchema,
          body: payload,
          idempotencyKey: options.idempotencyKey,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (productId: string): Promise<api.ProductResponse> =>
      orThrow(
        await this.#client.get(`/v1/products/${segment(productId)}`, {
          operation: 'getProduct',
          schema: api.ProductResponseSchema,
        })
      ),

    /**
     * A `billing_cycle` is immutable once set, so a recurring product's
     * interval cannot be changed — create a new product for a new cadence.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    update: async (
      productId: string,
      payload: api.UpdateProductRequest
    ): Promise<api.ProductResponse> =>
      orThrow(
        await this.#client.patch(`/v1/products/${segment(productId)}`, {
          operation: 'updateProduct',
          schema: api.ProductResponseSchema,
          body: payload,
        })
      ),

    /** Archived products are excluded unless you pass `include_archived`. */
    list: async (params: api.ListProductsParams = {}): Promise<Page<api.ProductResponse>> =>
      orThrow(
        await this.#client.get('/v1/products', {
          operation: 'listProducts',
          schema: pageOf(api.ProductResponseSchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListProductsParams = {}): AsyncIterable<api.ProductResponse> =>
      paginate(
        this.#client,
        '/v1/products',
        'listProducts',
        api.ProductResponseSchema,
        params as QueryParams
      ),

    /**
     * Stops the product being used in new checkouts. Existing subscriptions
     * keep billing. Idempotent.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    archive: async (productId: string): Promise<api.ProductResponse> =>
      orThrow(
        await this.#client.post(`/v1/products/${segment(productId)}/archive`, {
          operation: 'archiveProduct',
          schema: api.ProductResponseSchema,
        })
      ),

    /** Idempotent. @throws {Error} A {@link BachsApiFailure} when the call fails. */
    unarchive: async (productId: string): Promise<api.ProductResponse> =>
      orThrow(
        await this.#client.post(`/v1/products/${segment(productId)}/unarchive`, {
          operation: 'unarchiveProduct',
          schema: api.ProductResponseSchema,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Product groups
  |--------------------------------------------------------------------------
  */

  /** Collections that group products for presentation. */
  readonly productGroups = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    create: async (
      payload: api.CreateProductGroupRequest,
      options: WriteOptions = {}
    ): Promise<api.ProductGroupResponse> =>
      orThrow(
        await this.#client.post('/v1/product-groups', {
          operation: 'createProductGroup',
          schema: api.ProductGroupResponseSchema,
          body: payload,
          idempotencyKey: options.idempotencyKey,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (
      groupId: string,
      params: api.GetProductGroupParams = {}
    ): Promise<api.ProductGroupResponse> =>
      orThrow(
        await this.#client.get(`/v1/product-groups/${segment(groupId)}`, {
          operation: 'getProductGroup',
          schema: api.ProductGroupResponseSchema,
          query: params as QueryParams,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    update: async (
      groupId: string,
      payload: api.UpdateProductGroupRequest
    ): Promise<api.ProductGroupResponse> =>
      orThrow(
        await this.#client.patch(`/v1/product-groups/${segment(groupId)}`, {
          operation: 'updateProductGroup',
          schema: api.ProductGroupResponseSchema,
          body: payload,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    list: async (
      params: api.ListProductGroupsParams = {}
    ): Promise<Page<api.ProductGroupResponse>> =>
      orThrow(
        await this.#client.get('/v1/product-groups', {
          operation: 'listProductGroups',
          schema: pageOf(api.ProductGroupResponseSchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListProductGroupsParams = {}): AsyncIterable<api.ProductGroupResponse> =>
      paginate(
        this.#client,
        '/v1/product-groups',
        'listProductGroups',
        api.ProductGroupResponseSchema,
        params as QueryParams
      ),

    /** Answers `204`. @throws {Error} A {@link BachsApiFailure} when the call fails. */
    delete: async (groupId: string): Promise<void> => {
      orThrow(
        await this.#client.delete(`/v1/product-groups/${segment(groupId)}`, {
          operation: 'deleteProductGroup',
          schema: z.null(),
        })
      )
    },
  }

  /*
  |--------------------------------------------------------------------------
  | Subscriptions
  |--------------------------------------------------------------------------
  */

  /**
   * Recurring billing. Subscriptions are created by completing a checkout for
   * a recurring product, so there is nothing to create here — only to read,
   * change and cancel.
   */
  readonly subscriptions = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (subscriptionId: string): Promise<api.SubscriptionResponse> =>
      orThrow(
        await this.#client.get(`/v1/subscriptions/${segment(subscriptionId)}`, {
          operation: 'getSubscription',
          schema: api.SubscriptionResponseSchema,
        })
      ),

    /** Filter by customer or status. @throws {Error} A {@link BachsApiFailure} when the call fails. */
    list: async (
      params: api.ListSubscriptionsParams = {}
    ): Promise<Page<api.SubscriptionResponse>> =>
      orThrow(
        await this.#client.get('/v1/subscriptions', {
          operation: 'listSubscriptions',
          schema: pageOf(api.SubscriptionResponseSchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListSubscriptionsParams = {}): AsyncIterable<api.SubscriptionResponse> =>
      paginate(
        this.#client,
        '/v1/subscriptions',
        'listSubscriptions',
        api.SubscriptionResponseSchema,
        params as QueryParams
      ),

    /**
     * Changes a subscription. Send exactly one intent: change the plan, move
     * the trial, or swap the payment method.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    update: async (
      subscriptionId: string,
      payload: api.UpdateSubscriptionRequest
    ): Promise<api.SubscriptionResponse> =>
      orThrow(
        await this.#client.patch(`/v1/subscriptions/${segment(subscriptionId)}`, {
          operation: 'updateSubscription',
          schema: api.SubscriptionResponseSchema,
          body: payload,
        })
      ),

    /**
     * Cancels immediately, or at the end of the current period with
     * `cancel_at_period_end`. Cancelling at period end is almost always what
     * you want: the customer keeps what they paid for.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    cancel: async (
      subscriptionId: string,
      payload: api.CancelSubscriptionRequest = {}
    ): Promise<api.SubscriptionResponse> =>
      orThrow(
        await this.#client.delete(`/v1/subscriptions/${segment(subscriptionId)}`, {
          operation: 'cancelSubscription',
          schema: api.SubscriptionResponseSchema,
          body: payload,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Payments
  |--------------------------------------------------------------------------
  */

  /** Money customers have paid you. */
  readonly payments = {
    /**
     * The full payment: amount, status, customer, fees, products, refunds and
     * status history.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    get: async (paymentId: string): Promise<api.PaymentResponse> =>
      orThrow(
        await this.#client.get(`/v1/payments/${segment(paymentId)}`, {
          operation: 'getPaymentDetail',
          schema: api.PaymentResponseSchema,
        })
      ),

    /** The lighter charge-status view. @throws {Error} A {@link BachsApiFailure} when the call fails. */
    getChargeStatus: async (chargeId: string): Promise<api.ChargeStatusResponse> =>
      orThrow(
        await this.#client.get(`/v1/payments/charges/${segment(chargeId)}`, {
          operation: 'getChargeStatus',
          schema: api.ChargeStatusResponseSchema,
        })
      ),

    /**
     * One page of payments, newest first. List items carry a summary; call
     * {@link Bachs.payments.get} for fees, products and status history.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    list: async (
      params: api.ListPaymentsParams = {}
    ): Promise<Page<api.PaymentListItemResponse>> =>
      orThrow(
        await this.#client.get('/v1/payments', {
          operation: 'listPayments',
          schema: pageOf(api.PaymentListItemResponseSchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListPaymentsParams = {}): AsyncIterable<api.PaymentListItemResponse> =>
      paginate(
        this.#client,
        '/v1/payments',
        'listPayments',
        api.PaymentListItemResponseSchema,
        params as QueryParams
      ),

    /**
     * Payment methods available to your organization, with the currencies each
     * supports. Use it to decide what to show at checkout.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    listMethods: async (): Promise<api.PaymentMethodsResponse> =>
      orThrow(
        await this.#client.get('/v1/payment-methods', {
          operation: 'listPaymentMethods',
          schema: api.PaymentMethodsResponseSchema,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    listRails: async (params: api.ListPaymentRailsParams): Promise<api.PaymentRailsResponse> =>
      orThrow(
        await this.#client.get('/v1/payment-methods/rails', {
          operation: 'listPaymentRails',
          schema: api.PaymentRailsResponseSchema,
          query: params as QueryParams,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Refunds
  |--------------------------------------------------------------------------
  */

  /**
   * Returning money. Refunds settle asynchronously — `refund.paid` is the
   * event that says the customer has it.
   */
  readonly refunds = {
    /**
     * Only one refund can exist per charge.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    create: async (
      payload: api.CreateRefundRequest,
      options: WriteOptions = {}
    ): Promise<api.RefundResponse> =>
      orThrow(
        await this.#client.post('/v1/refunds', {
          operation: 'createRefund',
          schema: api.RefundResponseSchema,
          body: payload,
          idempotencyKey: options.idempotencyKey,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (refundId: string): Promise<api.RefundResponse> =>
      orThrow(
        await this.#client.get(`/v1/refunds/${segment(refundId)}`, {
          operation: 'getRefund',
          schema: api.RefundResponseSchema,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    getByCharge: async (paymentId: string): Promise<api.RefundResponse> =>
      orThrow(
        await this.#client.get(`/v1/refunds/by-charge/${segment(paymentId)}`, {
          operation: 'getRefundByCharge',
          schema: api.RefundResponseSchema,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    list: async (params: api.ListRefundsParams = {}): Promise<Page<api.RefundResponse>> =>
      orThrow(
        await this.#client.get('/v1/refunds', {
          operation: 'listRefunds',
          schema: pageOf(api.RefundResponseSchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListRefundsParams = {}): AsyncIterable<api.RefundResponse> =>
      paginate(
        this.#client,
        '/v1/refunds',
        'listRefunds',
        api.RefundResponseSchema,
        params as QueryParams
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Disputes
  |--------------------------------------------------------------------------
  */

  /** Chargebacks, and the evidence you answer them with. */
  readonly disputes = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (disputeId: string): Promise<api.DisputeResponse> =>
      orThrow(
        await this.#client.get(`/v1/disputes/${segment(disputeId)}`, {
          operation: 'getDispute',
          schema: api.DisputeResponseSchema,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    list: async (params: api.ListDisputesParams = {}): Promise<Page<api.DisputeSummary>> =>
      orThrow(
        await this.#client.get('/v1/disputes', {
          operation: 'listDisputes',
          schema: pageOf(api.DisputeSummarySchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListDisputesParams = {}): AsyncIterable<api.DisputeSummary> =>
      paginate(
        this.#client,
        '/v1/disputes',
        'listDisputes',
        api.DisputeSummarySchema,
        params as QueryParams
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    updateEvidence: async (
      disputeId: string,
      payload: api.DisputeEvidenceUpdateRequest
    ): Promise<api.DisputeEvidenceUpdateResponse> =>
      orThrow(
        await this.#client.patch(`/v1/disputes/${segment(disputeId)}/evidence`, {
          operation: 'updateDisputeEvidence',
          schema: api.DisputeEvidenceUpdateResponseSchema,
          body: payload,
        })
      ),

    /**
     * Submits the evidence. This is final — evidence cannot be changed after
     * it is submitted.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    submit: async (disputeId: string): Promise<api.DisputeSubmitResponse> =>
      orThrow(
        await this.#client.post(`/v1/disputes/${segment(disputeId)}/submit`, {
          operation: 'submitDispute',
          schema: api.DisputeSubmitResponseSchema,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Payouts
  |--------------------------------------------------------------------------
  */

  /** Getting your money out, and the destinations it goes to. */
  readonly payouts = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (withdrawalId: string): Promise<api.PayoutResponse> =>
      orThrow(
        await this.#client.get(`/v1/payouts/${segment(withdrawalId)}`, {
          operation: 'getPayout',
          schema: api.PayoutResponseSchema,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    list: async (params: api.ListPayoutsParams = {}): Promise<Page<api.PayoutResponse>> =>
      orThrow(
        await this.#client.get('/v1/payouts', {
          operation: 'listPayouts',
          schema: pageOf(api.PayoutResponseSchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListPayoutsParams = {}): AsyncIterable<api.PayoutResponse> =>
      paginate(
        this.#client,
        '/v1/payouts',
        'listPayouts',
        api.PayoutResponseSchema,
        params as QueryParams
      ),

    /**
     * Quotes a payout before you commit to it, so the fee and rate are known
     * up front.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    quote: async (payload: api.PayoutQuoteRequest): Promise<api.PayoutQuoteResponse> =>
      orThrow(
        await this.#client.post('/v1/payouts/quotes', {
          operation: 'createPayoutQuote',
          schema: api.PayoutQuoteResponseSchema,
          body: payload,
        })
      ),

    /**
     * Moves money out. Pass an `idempotencyKey` naming the withdrawal — a
     * retried withdrawal without one is a second withdrawal.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    createWithdrawal: async (
      payload: api.CreateWithdrawalRequest,
      options: WriteOptions = {}
    ): Promise<api.CreateWithdrawalResponse> =>
      orThrow(
        await this.#client.post('/v1/payouts/withdrawals', {
          operation: 'createWithdrawal',
          schema: api.CreateWithdrawalResponseSchema,
          body: payload,
          idempotencyKey: options.idempotencyKey,
        })
      ),

    /** Bank accounts and wallets you pay out to. */
    destinations: {
      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      list: async (): Promise<api.PayoutDestinationListResponse> =>
        orThrow(
          await this.#client.get('/v1/payouts/destinations', {
            operation: 'listPayoutDestinations',
            schema: api.PayoutDestinationListResponseSchema,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      create: async (
        payload: api.PayoutDestinationRequest,
        options: WriteOptions = {}
      ): Promise<api.PayoutDestinationResponse> =>
        orThrow(
          await this.#client.post('/v1/payouts/destinations', {
            operation: 'createPayoutDestination',
            schema: api.PayoutDestinationResponseSchema,
            body: payload,
            idempotencyKey: options.idempotencyKey,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      update: async (
        destinationId: string,
        payload: api.PayoutDestinationRequest
      ): Promise<api.PayoutDestinationResponse> =>
        orThrow(
          await this.#client.put(`/v1/payouts/destinations/${segment(destinationId)}`, {
            operation: 'updatePayoutDestination',
            schema: api.PayoutDestinationResponseSchema,
            body: payload,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      delete: async (destinationId: string): Promise<api.DeletePayoutDestinationResponse> =>
        orThrow(
          await this.#client.delete(`/v1/payouts/destinations/${segment(destinationId)}`, {
            operation: 'deletePayoutDestination',
            schema: api.DeletePayoutDestinationResponseSchema,
          })
        ),
    },

    /**
     * Confirms an account number really belongs to the name you expect, before
     * you send money to it.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    resolveBankAccount: async (
      payload: api.BankAccountResolveRequest
    ): Promise<api.BankAccountResolveResponse> =>
      orThrow(
        await this.#client.post('/v1/payouts/resolve-account', {
          operation: 'resolveBankAccount',
          schema: api.BankAccountResolveResponseSchema,
          body: payload,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    listBanks: async (params: api.ListBanksParams): Promise<api.BankListResponse> =>
      orThrow(
        await this.#client.get('/v1/payouts/banks', {
          operation: 'listBanks',
          schema: api.BankListResponseSchema,
          query: params as QueryParams,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    supportedCurrencies: async (
      params: api.GetSupportedPayoutCurrenciesParams
    ): Promise<api.SupportedPayoutCurrenciesByMethodResponse> =>
      orThrow(
        await this.#client.get('/v1/payouts/supported-currencies', {
          operation: 'getSupportedPayoutCurrencies',
          schema: api.SupportedPayoutCurrenciesByMethodResponseSchema,
          query: params as QueryParams,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Conversions
  |--------------------------------------------------------------------------
  */

  /** Moving a balance from one currency to another. */
  readonly conversions = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    quote: async (payload: api.ConversionQuoteRequest): Promise<api.ConversionQuoteResponse> =>
      orThrow(
        await this.#client.post('/v1/conversions/quotes', {
          operation: 'createConversionQuote',
          schema: api.ConversionQuoteResponseSchema,
          body: payload,
        })
      ),

    /**
     * Executes a quoted conversion.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    execute: async (
      payload: api.ConversionCreateRequest,
      options: WriteOptions = {}
    ): Promise<api.ConversionResponse> =>
      orThrow(
        await this.#client.post('/v1/conversions', {
          operation: 'executeConversion',
          schema: api.ConversionResponseSchema,
          body: payload,
          idempotencyKey: options.idempotencyKey,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (conversionId: string): Promise<api.ConversionResponse> =>
      orThrow(
        await this.#client.get(`/v1/conversions/${segment(conversionId)}`, {
          operation: 'getConversion',
          schema: api.ConversionResponseSchema,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    list: async (
      params: api.ListConversionsParams = {}
    ): Promise<Page<api.ConversionResponse>> =>
      orThrow(
        await this.#client.get('/v1/conversions', {
          operation: 'listConversions',
          schema: pageOf(api.ConversionResponseSchema),
          query: params as QueryParams,
        })
      ),

    /** Walks every page. @throws {Error} A {@link BachsApiFailure} when a page fails. */
    all: (params: api.ListConversionsParams = {}): AsyncIterable<api.ConversionResponse> =>
      paginate(
        this.#client,
        '/v1/conversions',
        'listConversions',
        api.ConversionResponseSchema,
        params as QueryParams
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Accounts and organization
  |--------------------------------------------------------------------------
  */

  /** Your balances. */
  readonly accounts = {
    /**
     * Balance buckets per currency — available, locked and pending — plus a
     * consolidated USD total.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    balances: async (): Promise<api.AccountBalanceResponse> =>
      orThrow(
        await this.#client.get('/v1/accounts/balances', {
          operation: 'getBalances',
          schema: api.AccountBalanceResponseSchema,
        })
      ),
  }

  /** The organization this key belongs to. */
  readonly organizations = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    me: async (): Promise<api.OrganizationResponse> =>
      orThrow(
        await this.#client.get('/v1/organizations/me', {
          operation: 'getMyOrganization',
          schema: api.OrganizationResponseSchema,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (organizationId: string): Promise<api.OrganizationResponse> =>
      orThrow(
        await this.#client.get(`/v1/organizations/${segment(organizationId)}`, {
          operation: 'getOrganization',
          schema: api.OrganizationResponseSchema,
        })
      ),

    /**
     * Bachs documents no response shape for this endpoint, so the body is
     * handed back unparsed.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    listConnectedAccounts: async (): Promise<unknown> =>
      orThrow(
        await this.#client.get('/v1/organizations/connected-accounts', {
          operation: 'listConnectedAccounts',
          schema: z.unknown(),
        })
      ),

    /**
     * Bachs documents no response shape for this endpoint, so the body is
     * handed back unparsed.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    getCheckoutSettings: async (): Promise<unknown> =>
      orThrow(
        await this.#client.get('/v1/organizations/checkout/settings', {
          operation: 'getCheckoutSettings',
          schema: z.unknown(),
        })
      ),

    /**
     * Bachs documents no response shape for this endpoint, so the body is
     * handed back unparsed.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    updateCheckoutSettings: async (payload: unknown): Promise<unknown> =>
      orThrow(
        await this.#client.put('/v1/organizations/checkout/settings', {
          operation: 'updateCheckoutSettings',
          schema: z.unknown(),
          body: payload,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Media
  |--------------------------------------------------------------------------
  */

  /** Files you attach to products. */
  readonly media = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    get: async (uploadId: string): Promise<api.UploadResponse> =>
      orThrow(
        await this.#client.get(`/v1/utilities/uploads/${segment(uploadId)}`, {
          operation: 'getUpload',
          schema: api.UploadResponseSchema,
        })
      ),

    /**
     * Deletes an upload that is not yet attached to a product. Answers `409`
     * once it is.
     *
     * @throws {Error} A {@link BachsApiFailure} when the call fails.
     */
    delete: async (uploadId: string): Promise<api.UploadDeleteResponse> =>
      orThrow(
        await this.#client.delete(`/v1/utilities/uploads/${segment(uploadId)}`, {
          operation: 'deleteUpload',
          schema: api.UploadDeleteResponseSchema,
        })
      ),
  }

  /*
  |--------------------------------------------------------------------------
  | Webhooks
  |--------------------------------------------------------------------------
  */

  /**
   * Receiving deliveries, and managing the endpoints they arrive on.
   *
   * Webhooks are the source of truth for fulfilment. Grant access from
   * {@link Bachs.webhooks.handle}, never from a redirect back to your site.
   */
  readonly webhooks = {
    /**
     * Verifies that a request genuinely came from Bachs and parses its
     * payload, returning the failure as a value rather than throwing.
     */
    verify: (ctx: HttpContext): ReturnType<WebhooksReceiver['verify']> =>
      this.#receiver.verify(ctx),

    /**
     * Verifies the request, skips deliveries already handled, runs the
     * matching handler and answers 200.
     *
     * @throws {Error} A {@link WebhookFailure} when the delivery cannot be
     * trusted or understood.
     */
    handle: (ctx: HttpContext, handlers: WebhookHandlers): Promise<WebhookDelivery> =>
      this.#receiver.handle(ctx, handlers),

    /** The URLs Bachs delivers to. */
    endpoints: {
      /**
       * Registers an endpoint. The signing secret comes back exactly once, in
       * this response — store it before you discard the object.
       *
       * @throws {Error} A {@link BachsApiFailure} when the call fails.
       */
      create: async (
        payload: api.CreateWebhookEndpointRequest
      ): Promise<api.CreateWebhookEndpointResponse> =>
        orThrow(
          await this.#client.post('/v1/webhooks/endpoints', {
            operation: 'createWebhookEndpoint',
            schema: api.CreateWebhookEndpointResponseSchema,
            body: payload,
          })
        ),

      /**
       * Bachs documents no response shape for this endpoint, so the body is
       * handed back unparsed.
       *
       * @throws {Error} A {@link BachsApiFailure} when the call fails.
       */
      list: async (): Promise<unknown> =>
        orThrow(
          await this.#client.get('/v1/webhooks/endpoints', {
            operation: 'listWebhookEndpoints',
            schema: z.unknown(),
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      get: async (endpointId: string): Promise<api.WebhookEndpoint> =>
        orThrow(
          await this.#client.get(`/v1/webhooks/endpoints/${segment(endpointId)}`, {
            operation: 'getWebhookEndpoint',
            schema: api.WebhookEndpointSchema,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      update: async (
        endpointId: string,
        payload: api.UpdateWebhookEndpointRequest
      ): Promise<api.WebhookEndpoint> =>
        orThrow(
          await this.#client.patch(`/v1/webhooks/endpoints/${segment(endpointId)}`, {
            operation: 'updateWebhookEndpoint',
            schema: api.WebhookEndpointSchema,
            body: payload,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      delete: async (endpointId: string): Promise<api.DeleteWebhookEndpointResponse> =>
        orThrow(
          await this.#client.delete(`/v1/webhooks/endpoints/${segment(endpointId)}`, {
            operation: 'deleteWebhookEndpoint',
            schema: api.DeleteWebhookEndpointResponseSchema,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      getSecret: async (endpointId: string): Promise<api.WebhookEndpointSecretResponse> =>
        orThrow(
          await this.#client.get(`/v1/webhooks/endpoints/${segment(endpointId)}/secret`, {
            operation: 'getWebhookEndpointSecret',
            schema: api.WebhookEndpointSecretResponseSchema,
          })
        ),

      /**
       * Issues a new signing secret. The old one stops working immediately, so
       * deploy the new secret alongside the old one first — `webhookSecret`
       * accepts an array for exactly this.
       *
       * @throws {Error} A {@link BachsApiFailure} when the call fails.
       */
      rotateSecret: async (endpointId: string): Promise<api.WebhookEndpoint> =>
        orThrow(
          await this.#client.post(`/v1/webhooks/endpoints/${segment(endpointId)}/rotate-secret`, {
            operation: 'rotateWebhookEndpointSecret',
            schema: api.WebhookEndpointSchema,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      metrics: async (
        endpointId: string,
        params: api.GetWebhookEndpointMetricsParams = {}
      ): Promise<api.WebhookMetricsResponse> =>
        orThrow(
          await this.#client.get(`/v1/webhooks/endpoints/${segment(endpointId)}/metrics`, {
            operation: 'getWebhookEndpointMetrics',
            schema: api.WebhookMetricsResponseSchema,
            query: params as QueryParams,
          })
        ),
    },

    /** The deliveries themselves, for debugging what did or did not land. */
    events: {
      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      list: async (
        params: api.ListWebhookEventsParams = {}
      ): Promise<api.WebhookEventsListResponse> =>
        orThrow(
          await this.#client.get('/v1/webhooks/events', {
            operation: 'listWebhookEvents',
            schema: api.WebhookEventsListResponseSchema,
            query: params as QueryParams,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      get: async (eventId: string): Promise<api.WebhookEventDetail> =>
        orThrow(
          await this.#client.get(`/v1/webhooks/events/${segment(eventId)}`, {
            operation: 'getWebhookEvent',
            schema: api.WebhookEventDetailSchema,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      listForEndpoint: async (
        endpointId: string,
        params: api.ListWebhookEndpointEventsParams = {}
      ): Promise<api.WebhookEndpointEventsListResponse> =>
        orThrow(
          await this.#client.get(`/v1/webhooks/endpoints/${segment(endpointId)}/events`, {
            operation: 'listWebhookEndpointEvents',
            schema: api.WebhookEndpointEventsListResponseSchema,
            query: params as QueryParams,
          })
        ),

      /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
      getForEndpoint: async (
        endpointId: string,
        eventId: string
      ): Promise<api.WebhookEventDetail> =>
        orThrow(
          await this.#client.get(
            `/v1/webhooks/endpoints/${segment(endpointId)}/events/${segment(eventId)}`,
            {
              operation: 'getWebhookEndpointEvent',
              schema: api.WebhookEventDetailSchema,
            }
          )
        ),

      /**
       * Re-delivers a past event to one endpoint.
       *
       * @throws {Error} A {@link BachsApiFailure} when the call fails.
       */
      resend: async (
        endpointId: string,
        eventId: string
      ): Promise<api.ResendWebhookEventResponse> =>
        orThrow(
          await this.#client.post(
            `/v1/webhooks/endpoints/${segment(endpointId)}/events/${segment(eventId)}/resend`,
            {
              operation: 'resendWebhookEvent',
              schema: api.ResendWebhookEventResponseSchema,
            }
          )
        ),

      /**
       * Creates a fresh delivery attempt for an event your endpoint missed.
       * Bachs documents no response shape, so the body is handed back
       * unparsed.
       *
       * @throws {Error} A {@link BachsApiFailure} when the call fails.
       */
      replay: async (payload: unknown): Promise<unknown> =>
        orThrow(
          await this.#client.post('/v1/webhooks/replay', {
            operation: 'replayWebhookEvent',
            schema: z.unknown(),
            body: payload,
          })
        ),
    },
  }

  /*
  |--------------------------------------------------------------------------
  | Currencies
  |--------------------------------------------------------------------------
  */

  /** What Bachs can take money in, and pay money out in. */
  readonly currencies = {
    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    supported: async (): Promise<api.SupportedCurrenciesResponse> =>
      orThrow(
        await this.#client.get('/v1/currencies/supported', {
          operation: 'listSupportedCurrencies',
          schema: api.SupportedCurrenciesResponseSchema,
        })
      ),

    /** @throws {Error} A {@link BachsApiFailure} when the call fails. */
    payoutSupported: async (): Promise<api.PayoutSupportedCurrenciesResponse> =>
      orThrow(
        await this.#client.get('/v1/currencies/payout-supported', {
          operation: 'listPayoutSupportedCurrencies',
          schema: api.PayoutSupportedCurrenciesResponseSchema,
        })
      ),
  }
}

/**
 * Schemas for the Bachs API, generated from `resources/openapi.json`.
 *
 * DO NOT EDIT BY HAND. Run `npm run generate:schemas` after updating the
 * vendored spec, and review the diff.
 *
 * A field is optional here exactly when the specification does not list it as
 * required. Where Bachs documents no required set for a response object, every
 * field parses as optional: this package will not promise a presence the API
 * does not, because a parse that rejects a genuine payment is worse than a
 * field you have to check.
 *
 * Money is always a decimal string at the currency's precision (`"29.00"`),
 * paired with an ISO 4217 currency. There are no minor units anywhere in this
 * API, so nothing here is a number you can safely do arithmetic on.
 */
import { z } from 'zod'

/**
 * A string enum that reads either casing and hands back the one the
 * specification documents.
 *
 * The API and its document disagree on case for several enums — a checkout
 * session is created with `status: "open"` where the spec says `OPEN` — and
 * rejecting a real, paid checkout over letter case is the worst possible
 * trade. Unknown values still fail, so a genuinely new state is not swallowed.
 */
function caseInsensitiveEnum<const T extends readonly [string, ...string[]]>(values: T) {
  const canonical = new Map(values.map((value) => [value.toLowerCase(), value]))

  return z.preprocess(
    (value) => (typeof value === 'string' ? (canonical.get(value.toLowerCase()) ?? value) : value),
    z.enum(values)
  )
}

export const MerchantIntentSchema = z.object({
  /** Base currency code (e.g., 'USD', 'NGN'). Must be a supported fiat currency. */
  currency: z.string(),
  /**
   * Base amount as decimal string. Required for a fixed price; omit for a custom
   * (buyer-entered) or free price. Minimum 1000 for `NGN`, 1 for `USD` (and per-currency
   * minimums for other supported currencies).
   */
  amount: z.string().optional(),
  /**
   * `fixed` (default when amount is set) | `custom` (buyer enters the amount at checkout,
   * within optional bounds, via the checkout-level set-amount) | `free` ($0).
   */
  price_type: caseInsensitiveEnum(['fixed', 'custom', 'free']).optional(),
  /** Suggested starting amount for a custom price. */
  preset_amount: z.string().optional(),
  /** Lower bound for a custom price. */
  minimum_amount: z.string().optional(),
  /** Upper bound for a custom price. */
  maximum_amount: z.string().optional(),
  /**
   * Currency-specific pricing overrides. Keys are fiat currency codes, values are decimal
   * amount strings.
   */
  currency_options: z.record(z.string(), z.string()).optional(),
})

export type MerchantIntent = z.infer<typeof MerchantIntentSchema>

/**
 * Ad-hoc price override for this checkout only (no product is created). Priced in the
 * product's primary currency. Supports the same price types as catalog prices: `fixed`,
 * `custom`, `free`.
 */
export const AdhocPriceInputSchema = z.object({
  /**
   * `fixed` sets a set amount via `amount`. `custom` is pay-what-you-want, bounded by
   * `minimum_amount`/`maximum_amount` with an optional `preset_amount`; the buyer picks the
   * amount at checkout. `free` is a $0 line that completes without payment; on a recurring
   * product it creates a free subscription (no card, renews with no charge).
   */
  price_type: caseInsensitiveEnum(['fixed', 'custom', 'free']).optional(),
  /** The price, for a `fixed` ad-hoc price. Required for `fixed`; not valid for `custom`. */
  amount: z.string().nullable().optional(),
  /** Suggested starting amount for a `custom` ad-hoc price. */
  preset_amount: z.string().nullable().optional(),
  /** Lower bound for a `custom` ad-hoc price. */
  minimum_amount: z.string().nullable().optional(),
  /** Upper bound for a `custom` ad-hoc price. */
  maximum_amount: z.string().nullable().optional(),
})

export type AdhocPriceInput = z.infer<typeof AdhocPriceInputSchema>

export const ProductItemRequestSchema = z.object({
  /** Product ID to include in checkout. */
  product_id: z.string(),
  /** Number of units for the product item. */
  quantity: z.number().int().optional(),
  /**
   * Chosen amount for a pay-what-you-want price. For a catalog CUSTOM product, or an ad-hoc
   * CUSTOM price (pre-filling the buyer's amount).
   */
  amount: z.string().nullable().optional(),
  pricing: AdhocPriceInputSchema.nullable().optional(),
})

export type ProductItemRequest = z.infer<typeof ProductItemRequestSchema>

export const ExistingCustomerRequestSchema = z.object({
  /** Existing customer ID. */
  customer_id: z.string(),
})

export type ExistingCustomerRequest = z.infer<typeof ExistingCustomerRequestSchema>

export const NewCustomerRequestSchema = z.object({
  /** Customer email address. */
  email: z.string(),
  /** Customer full name. */
  name: z.string(),
  /** Customer phone number. */
  phone_number: z.string().nullable().optional(),
})

export type NewCustomerRequest = z.infer<typeof NewCustomerRequestSchema>

export const CreateCheckoutSessionRequestSchema = z.object({
  /** Optional checkout billing currency. If omitted, defaults to product pricing currency. */
  billing_currency: z.string().nullable().optional(),
  /** Optional list of allowed payment methods. */
  allowed_payment_method_types: z.array(caseInsensitiveEnum(['card', 'crypto', 'bank_transfer', 'mobile_money'])).nullable().optional(),
  /**
   * Where to send the customer if they cancel or abandon the checkout. Returned on the
   * checkout so the hosted page can route back to it.
   */
  cancel_url: z.string().nullable().optional(),
  /**
   * Deprecated alias for `success_url`, kept for backward compatibility. If both are set,
   * `success_url` wins.
   */
  return_url: z.string().nullable().optional(),
  /**
   * Where to redirect the customer after a successful payment. Bachs appends
   * `?checkout_id=<id>`. This is the primary success-redirect field.
   */
  success_url: z.string().optional(),
  /** Customer details for the checkout session. */
  customer: z.union([ExistingCustomerRequestSchema, NewCustomerRequestSchema]),
  /** Optional metadata (max 20 keys, max 10KB total). */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Catalog products to include in this checkout session. Mutually exclusive with `pricing`. */
  product_cart: z.array(ProductItemRequestSchema).optional(),
  /** Raw pricing for a product-less (pure) checkout. Mutually exclusive with `product_cart`. */
  pricing: MerchantIntentSchema.nullable().optional(),
  /**
   * Optional client reference (unique per organization). If not provided, one will be
   * auto-generated. Used for idempotency and tracking.
   */
  reference: z.string().nullable().optional(),
  /**
   * Minutes until the checkout session expires. Defaults to 60. After expiry the checkout URL
   * is invalid.
   */
  expires_in_minutes: z.number().int().optional(),
}).refine(
  (value: Record<string, unknown>) => {
    const satisfied = [
    ['product_cart'].every((key) => value[key] !== undefined),
    ['pricing'].every((key) => value[key] !== undefined),
    ].filter(Boolean).length
    return satisfied === 1
  },
  { message: 'Provide exactly one of: product_cart | pricing' }
)

export type CreateCheckoutSessionRequest = z.infer<typeof CreateCheckoutSessionRequestSchema>

export const CreateRefundRequestSchema = z.object({
  /** The ID of the payment to refund. */
  charge_id: z.string(),
  /** Your unique identifier for this refund. Must be unique per organization and environment. */
  reference: z.string(),
  /**
   * Destination wallet address for crypto refunds. Required when the charge currency is a
   * cryptocurrency.
   */
  refund_address: z.string().nullable().optional(),
  /**
   * Optional partial refund amount in the charge settlement currency. Omit to refund the full
   * remaining refundable balance.
   */
  amount: z.string().nullable().optional(),
  /**
   * Who bears the refund processing fee. `org` (default) charges the fee to your balance;
   * `customer` deducts it from the amount returned to the customer.
   */
  fee_bearer: caseInsensitiveEnum(['org', 'customer']).nullable().optional(),
  /** Human-readable reason for the refund. */
  reason: z.string().nullable().optional(),
  /**
   * A key you supply to make this request idempotent. If you send the same idempotency_key
   * twice for the same charge, the second request returns the existing refund.
   */
  idempotency_key: z.string().nullable().optional(),
  /** Test mode only. Force a specific refund outcome. Omit to use the default sandbox outcome. */
  simulated_outcome: caseInsensitiveEnum(['success', 'failed']).nullable().optional(),
})

export type CreateRefundRequest = z.infer<typeof CreateRefundRequestSchema>

export const RefundResponseSchema = z.object({
  /** Unique identifier for this refund. */
  refund_id: z.string().optional(),
  /** The payment this refund is associated with. */
  charge_id: z.string().optional(),
  /** The reference you supplied on creation. */
  reference: z.string().optional(),
  /**
   * Current refund status. `processing` = awaiting provider (1-5 business days); `success` =
   * funds returned to customer; `failed` = refund rejected.
   */
  status: caseInsensitiveEnum(['processing', 'success', 'failed']).optional(),
  /** The refund amount you requested, in the charge's settlement currency. */
  requested_amount: z.string().optional(),
  /**
   * The amount actually returned to the customer. Null until the refund completes or partially
   * settles.
   */
  refunded_amount: z.string().nullable().optional(),
  /** Fee charged for this refund, in the charge's settlement currency. "0" if no fee applies. */
  refund_fee_amount: z.string().optional(),
  /**
   * Who bears the refund processing fee. `org` means the merchant absorbs the fee; `customer`
   * means it is deducted from the refunded amount.
   */
  fee_bearer: caseInsensitiveEnum(['org', 'customer']).optional(),
  /** The reason you provided, or null if none was given. */
  reason: z.string().nullable().optional(),
  /** ISO 8601 timestamp when the refund was created. */
  created_at: z.string().optional(),
  /** ISO 8601 timestamp of the last status update. */
  updated_at: z.string().optional(),
  /**
   * ISO 8601 timestamp when the refund reached a terminal status (SUCCESS or FAILED). Null
   * while still processing.
   */
  completed_at: z.string().nullable().optional(),
})

export type RefundResponse = z.infer<typeof RefundResponseSchema>

export const RefundListResponseSchema = z.object({
  /** Total number of refunds matching the query, across all pages. */
  total: z.number().int().optional(),
  /** Refund objects for the current page. */
  items: z.array(RefundResponseSchema).optional(),
})

export type RefundListResponse = z.infer<typeof RefundListResponseSchema>

/** Response containing checkout session details and hosted checkout URL. */
export const CreateCheckoutSessionResponseSchema = z.object({
  /** Unique identifier for the underlying checkout. */
  checkout_id: z.string().optional(),
  /** Hosted checkout URL where your customer can complete payment. */
  checkout_url: z.string().optional(),
  /**
   * Current checkout status. New sessions start in `OPEN`. `OPEN`: Awaiting customer payment.
   * New sessions start here. `COMPLETED`: Payment succeeded. This is a terminal state.
   * `EXPIRED`: The session window elapsed before payment. This is a terminal state.
   * `CANCELLED`: Canceled before completion. This is a terminal state.
   */
  status: caseInsensitiveEnum(['OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED']).optional(),
  /**
   * ISO 8601 timestamp indicating when the checkout will expire. After this time, customers
   * cannot complete payment through this checkout.
   */
  expires_at: z.string().optional(),
  /** ISO 8601 timestamp indicating when the checkout was created. */
  created_at: z.string().optional(),
})

export type CreateCheckoutSessionResponse = z.infer<typeof CreateCheckoutSessionResponseSchema>

export const CreateQuoteRequestSchema = z.object({
  pricing: MerchantIntentSchema,
  /** Payment method (CARD, CRYPTO, BANK_TRANSFER, MOBILE_MONEY) */
  payment_method: z.string(),
  /** Currency code (e.g., 'USD', 'NGN', 'TZS', 'USDT_TRC20') */
  to_currency: z.string(),
  /**
   * Selected payment rail identifier. Fetch available rails by calling GET
   * /v1/payments/rails?payment_method={method}&currency={currency}. Use the 'id' field from
   * the response. Required when multiple rails are available for the payment method and
   * currency combination.
   */
  payment_rail: z.string().optional(),
  /**
   * Customer email address (optional; defaults to system identity for provider-specific
   * quotes)
   */
  customer_email: z.string().optional(),
  /** Customer name (optional; defaults to a system identity when omitted) */
  customer_name: z.string().optional(),
})

export type CreateQuoteRequest = z.infer<typeof CreateQuoteRequestSchema>

/** External response for quote (all payment methods) - excludes provider and gateway details */
export const QuoteResponseSchema = z.object({
  /** Quote ID (gateway-specific or internal) */
  quote_id: z.string().optional(),
  /** Payment method used to generate quote */
  payment_method: z.string().optional(),
  /** Payment rail used to generate quote */
  payment_rail: z.string().optional(),
  /** Base USD amount before fees */
  base_amount_usd: z.string().optional(),
  /** Amount in local currency (what customer pays) */
  amount_local_base: z.string().optional(),
  /** Local currency code (e.g., 'NGN', 'TZS', 'USD') */
  currency: z.string().optional(),
  /** Processing fee amount (as string) */
  processing_fee: z.string().optional(),
  /** Exchange rate (Decimal as string, if applicable) */
  exchange_rate: z.string().optional(),
  /** Total amount customer pays (base + fee) */
  total_amount: z.string().optional(),
  /** Payment type (for Cashramp: 'deposit' or 'withdrawal') */
  payment_type: z.string().optional(),
  /** Quote expiration time (ISO datetime) */
  expires_at: z.string().optional(),
  /** Whether customer bears the fee */
  customer_bears_fee: z.boolean().optional(),
})

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>

/** Complete payment details including current status, payment information, and status history */
export const ChargeStatusResponseSchema = z.object({
  /** Unique identifier for this payment/payment. Use this ID to track the payment status. */
  charge_id: z.string().optional(),
  /** Organization ID that created this payment. */
  organization_id: z.string().optional(),
  /** Customer identifier associated with this payment. */
  customer_id: z.string().optional(),
  /** Amount the customer paid, in the payment currency. This is a decimal string for precision. */
  amount: z.string().optional(),
  /** Currency code that the customer paid in (e.g., 'NGN', 'USD', 'GHS'). */
  currency: z.string().optional(),
  /** Currency code you will receive settlement in. This may differ from the payment currency. */
  settlement_currency: z.string().optional(),
  /**
   * Amount you will receive after fees are deducted, in settlement_currency. This is a decimal
   * string for precision.
   */
  settlement_amount: z.string().optional(),
  /**
   * Current status of the payment. PENDING, AWAITING_PAYMENT, and PROCESSING are non-final
   * states. COMPLETED, FAILED, CANCELLED, EXPIRED, and REFUNDED are final states.
   */
  status: caseInsensitiveEnum(['PENDING', 'AWAITING_PAYMENT', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED']).optional(),
  /**
   * Custom metadata you provided when creating the checkout. This can include order IDs,
   * product SKUs, or any other relevant information.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
  /**
   * Chronological history of all status changes for this payment. Useful for tracking the
   * payment lifecycle.
   */
  status_history: z.array(z.object({
    /** Status at this point in time */
    status: z.string().optional(),
    /** ISO 8601 timestamp when this status change occurred */
    occurred_at: z.string().optional(),
    /** Transaction reference from the payment provider, if available */
    provider_reference: z.string().nullable().optional(),
    /** Optional reason or description for this status change */
    reason: z.string().nullable().optional(),
  })).optional(),
  /** ISO 8601 timestamp when the payment was created. */
  created_at: z.string().optional(),
  /** ISO 8601 timestamp when the payment was last updated. */
  updated_at: z.string().optional(),
})

export type ChargeStatusResponse = z.infer<typeof ChargeStatusResponseSchema>

/** Response containing supported payment methods. */
export const PaymentMethodsResponseSchema = z.object({
  /**
   * List of payment methods available to the authenticated organization in the current
   * environment.
   */
  payment_methods: z.array(z.object({
    /** Payment method identifier. */
    id: z.string(),
    /** Human-readable payment method name. */
    display_name: z.string(),
    /** Icon or token representing the method. */
    icon: z.string(),
    /** Developer-facing payment method description. */
    description: z.string(),
    /** Method type (for example `fiat` or `crypto`). */
    type: z.string(),
    /** Whether enabled by default for organizations. */
    enabled_by_default: z.boolean(),
    /** Currencies supported for this method. */
    currencies: z.array(z.string()),
  })),
})

export type PaymentMethodsResponse = z.infer<typeof PaymentMethodsResponseSchema>

/** Response containing all supported currencies organized by type (fiat and cryptocurrency) */
export const SupportedCurrenciesResponseSchema = z.object({
  /**
   * List of supported fiat (traditional) currencies. These are government-issued currencies
   * like USD, NGN, GHS.
   */
  fiat: z.array(z.string()).optional(),
  /**
   * List of supported cryptocurrency codes. These may include network identifiers (e.g.,
   * 'USDT_TRC20' for Tron network, 'USDT_ERC20' for Ethereum network).
   */
  crypto: z.array(z.string()).optional(),
})

export type SupportedCurrenciesResponse = z.infer<typeof SupportedCurrenciesResponseSchema>

/** Organization balance snapshot across currencies, including spendable and in-flight amounts. */
export const AccountBalanceResponseSchema = z.object({
  /** Organization ID the returned balances belong to. */
  account_id: z.string(),
  /** One balance object per currency bucket. */
  balances: z.array(z.object({
    /** Currency code for this bucket (ISO 4217 or configured crypto code). */
    currency: z.string(),
    /** Amount currently available for new operations in this currency. */
    available_balance: z.string(),
    /** In-flight amount not yet available for spending. */
    pending_balance: z.string(),
  })),
  /** Aggregate of available and pending balances converted to USD. */
  total_balance_usd: z.string(),
  /**
   * Upcoming settlements grouped by day. Empty when no settlements are pending. Each entry
   * describes settlements expected to become available on a given date.
   */
  pending_settlements_by_day: z.array(z.record(z.string(), z.unknown())).optional(),
})

export type AccountBalanceResponse = z.infer<typeof AccountBalanceResponseSchema>

/** Currencies currently supported for payout flows, grouped by type. */
export const PayoutSupportedCurrenciesResponseSchema = z.object({
  /** Payout-supported fiat currencies. */
  fiat: z.array(z.string()),
  /** Payout-supported crypto currencies. */
  crypto: z.array(z.string()),
})

export type PayoutSupportedCurrenciesResponse = z.infer<typeof PayoutSupportedCurrenciesResponseSchema>

export const PayoutQuoteRequestSchema = z.object({
  /** Currency to debit from balance. */
  from_currency: z.string(),
  /** Destination payout currency. */
  to_currency: z.string(),
  /** Amount in `from_currency` to quote. */
  amount: z.string(),
  /** Optional payout method hint. */
  payout_method: z.string().nullable().optional(),
})

export type PayoutQuoteRequest = z.infer<typeof PayoutQuoteRequestSchema>

/** Response containing payout quote details. */
export const PayoutQuoteResponseSchema = z.object({
  /** Payout quote ID. */
  quote_id: z.string(),
  /** Debited currency. */
  from_currency: z.string(),
  /** Destination currency. */
  to_currency: z.string(),
  /** Quoted amount in source currency. */
  from_amount: z.string(),
  /** Quoted amount in destination currency. */
  to_amount: z.string(),
  /** Applied quote exchange rate. */
  exchange_rate: z.string(),
  /** Quote expiration timestamp. */
  expires_at: z.string(),
})

export type PayoutQuoteResponse = z.infer<typeof PayoutQuoteResponseSchema>

export const CreateWithdrawalRequestSchema = z.object({
  /** Currency to debit from balance. */
  from_currency: z.string(),
  /** Currency to send to payout destination. */
  to_currency: z.string(),
  /** Amount to withdraw in `from_currency`. */
  amount: z.string(),
  /** Payout method (`BANK_TRANSFER`, `MOBILE_MONEY`, `CRYPTO`). */
  payment_method: z.string(),
  /** Payout quote ID from `/v1/payouts/quotes`. */
  quote_id: z.string().nullable().optional(),
  /** Unique withdrawal reference per organization. */
  reference: z.string(),
  /** Contact email for payout processing context. */
  email: z.string(),
  /** Idempotency key for duplicate protection. */
  idempotency_key: z.string().nullable().optional(),
  /** Optional payout rail identifier. */
  payment_rail: z.string().nullable().optional(),
  /** Custom withdrawal metadata. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Saved payout destination ID. */
  payout_destination_id: z.string().nullable().optional(),
  /** Bank account number for bank-transfer payouts. */
  account_number: z.string().nullable().optional(),
  /** Bank code for bank-transfer payouts. */
  bank_code: z.string().nullable().optional(),
  /** Phone number for mobile-money payouts. */
  phone_number: z.string().nullable().optional(),
  /** Wallet address for crypto payouts. */
  wallet_address: z.string().nullable().optional(),
  /** Network identifier for crypto payouts when required. */
  network: z.string().nullable().optional(),
  /** Optional crypto memo/tag. */
  memo: z.string().nullable().optional(),
  /** Optional payout description. */
  description: z.string().nullable().optional(),
})

export type CreateWithdrawalRequest = z.infer<typeof CreateWithdrawalRequestSchema>

/** Response returned after creating a withdrawal request. */
export const CreateWithdrawalResponseSchema = z.object({
  /** Withdrawal identifier for status tracking. */
  withdrawal_id: z.string(),
  /** Current withdrawal status. */
  status: z.string(),
  /** Processor reference when available. */
  provider_reference: z.string().nullable().optional(),
})

export type CreateWithdrawalResponse = z.infer<typeof CreateWithdrawalResponseSchema>

export const PayoutDestinationRequestSchema = z.object({
  /** Type of payout destination */
  destination_type: caseInsensitiveEnum(['bank_account', 'mobile_money', 'crypto_wallet']),
  /** Currency code */
  currency: z.string(),
  /** User-friendly name */
  label: z.string().optional(),
  /** Bank account number */
  account_number: z.string().optional(),
  /** Account holder name */
  account_name: z.string().optional(),
  /** Bank code/routing number */
  bank_code: z.string().optional(),
  /** Bank name */
  bank_name: z.string().optional(),
  /** Phone number (for mobile money) */
  phone_number: z.string().optional(),
  /** Mobile provider (MTN, Vodafone, etc.) */
  mobile_provider: z.string().optional(),
  /** Crypto wallet address */
  wallet_address: z.string().optional(),
  /** Network (optional if currency includes it) */
  network: z.string().optional(),
  /** Additional fields as JSON */
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type PayoutDestinationRequest = z.infer<typeof PayoutDestinationRequestSchema>

/**
 * Response containing payout destination details (bank account, mobile money, or crypto
 * wallet)
 */
export const PayoutDestinationResponseSchema = z.object({
  /** Unique identifier for this payout destination. Use this ID when creating withdrawals. */
  id: z.string().optional(),
  /** Organization ID that owns this destination. */
  organization_id: z.string().optional(),
  /** Environment this destination belongs to. 'test' for test mode, 'live' for production. */
  env: caseInsensitiveEnum(['test', 'live']).optional(),
  /** Type of payout destination. Determines which fields are populated. */
  destination_type: caseInsensitiveEnum(['bank_account', 'mobile_money', 'crypto_wallet']).optional(),
  /**
   * Currency code this destination accepts (e.g., 'NGN', 'USD', 'USDT_TRC20'). Withdrawals to
   * this destination must use this currency.
   */
  currency: z.string().optional(),
  /** User-friendly name for this destination. Helps you identify destinations in your system. */
  label: z.string().optional(),
  /** Bank account number. Only populated for bank_account destinations. */
  account_number: z.string().nullable().optional(),
  /**
   * Account holder name as registered with the bank. Only populated for bank_account
   * destinations.
   */
  account_name: z.string().nullable().optional(),
  /** Bank code or routing number. Only populated for bank_account destinations. */
  bank_code: z.string().nullable().optional(),
  /** Full name of the bank. Only populated for bank_account destinations. */
  bank_name: z.string().nullable().optional(),
  /**
   * Phone number associated with the mobile money account. Only populated for mobile_money
   * destinations.
   */
  phone_number: z.string().nullable().optional(),
  /**
   * Mobile money provider (e.g., 'MTN', 'Vodafone'). Only populated for mobile_money
   * destinations.
   */
  mobile_provider: z.string().nullable().optional(),
  /** Cryptocurrency wallet address. Only populated for crypto_wallet destinations. */
  wallet_address: z.string().nullable().optional(),
  /**
   * Blockchain network (e.g., 'TRC20', 'ERC20'). Only populated for crypto_wallet
   * destinations. May be included in currency code (e.g., 'USDT_TRC20').
   */
  network: z.string().nullable().optional(),
  /**
   * Whether this destination is active and can receive payouts. Inactive destinations cannot
   * be used for withdrawals.
   */
  is_active: z.boolean().optional(),
  /** Additional custom metadata associated with this destination. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** ISO 8601 timestamp when this destination was created. */
  created_at: z.string().optional(),
  /** ISO 8601 timestamp when this destination was last updated. */
  updated_at: z.string().optional(),
})

export type PayoutDestinationResponse = z.infer<typeof PayoutDestinationResponseSchema>

/** Response containing list of all configured payout destinations */
export const PayoutDestinationListResponseSchema = z.object({
  /** Array of payout destination objects */
  destinations: z.array(PayoutDestinationResponseSchema).optional(),
  /** Total number of payout destinations for your organization. */
  total: z.number().int().optional(),
})

export type PayoutDestinationListResponse = z.infer<typeof PayoutDestinationListResponseSchema>

export const BankAccountResolveRequestSchema = z.object({
  /** Bank code (e.g., '033') */
  bank_code: z.string(),
  /** Account number to resolve */
  account_number: z.string(),
})

export type BankAccountResolveRequest = z.infer<typeof BankAccountResolveRequestSchema>

/** Response containing bank account validation and resolution details */
export const BankAccountResolveResponseSchema = z.object({
  /**
   * Whether the bank account was successfully resolved. true if account details are valid,
   * false if invalid.
   */
  status: z.boolean().optional(),
  /** Human-readable message describing the resolution result. */
  message: z.string().optional(),
  /**
   * Resolved bank account details. Only present when status is true. Contains account_name,
   * bank_name, and other validated information.
   */
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Error message if account resolution failed. Only present when status is false. */
  error: z.string().nullable().optional(),
})

export type BankAccountResolveResponse = z.infer<typeof BankAccountResolveResponseSchema>

/** Response containing bank list results. */
export const BankListResponseSchema = z.object({
  /** Whether the request succeeded. */
  status: z.boolean(),
  /** Human-readable response message. */
  message: z.string(),
  /** Bank records when available. */
  data: z.array(z.object({
    /** Bank display name. */
    name: z.string(),
    /** Provider-specific stable slug for the bank. */
    slug: z.string(),
    /** Bank code used for payout account resolution. */
    code: z.string(),
    /** NIBSS bank code where applicable. */
    nibss_bank_code: z.string().nullable().optional(),
    /** Country code where the bank operates. */
    country: z.string(),
  })).nullable().optional(),
  /** Error details when request fails. */
  error: z.string().nullable().optional(),
})

export type BankListResponse = z.infer<typeof BankListResponseSchema>

/**
 * Payout/withdrawal response. Core fields are always present; extended fields may be null when
 * not populated by the current endpoint flow.
 */
export const PayoutResponseSchema = z.object({
  /** Withdrawal identifier. */
  withdrawal_id: z.string(),
  /** Organization that owns the withdrawal. */
  organization_id: z.string(),
  /** Merchant-provided reference. */
  reference: z.string().nullable().optional(),
  /** Withdrawal amount. */
  amount: z.string(),
  /** Withdrawal currency code. */
  currency: z.string(),
  /** Current withdrawal status. */
  status: caseInsensitiveEnum(['pending_submission', 'pending_collection', 'processing', 'manual_review', 'successful', 'failed', 'cancelled', 'expired', 'reconciled']),
  /** Debited currency. */
  from_currency: z.string().nullable().optional(),
  /** Destination currency. */
  to_currency: z.string().nullable().optional(),
  /** Debited amount in `from_currency`. */
  from_amount: z.string().nullable().optional(),
  /** Destination amount in `to_currency`. */
  to_amount: z.string().nullable().optional(),
  /** Applied exchange rate. */
  exchange_rate: z.string().nullable().optional(),
  /** Redacted destination summary. */
  destination: z.string().nullable().optional(),
  /** Quote used for the withdrawal. */
  quote_id: z.string().nullable().optional(),
  /** Withdrawal method */
  payout_method: z.string().nullable().optional(),
  /** Processor reference when available. */
  provider_reference: z.string().nullable().optional(),
  /** Withdrawal metadata. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Rejection reason when applicable. */
  rejection_reason: z.string().nullable().optional(),
  /** Parent withdrawal ID for batched payouts. */
  parent_withdrawal_id: z.string().nullable().optional(),
  /** Batch index for split withdrawals. */
  batch_index: z.number().int().nullable().optional(),
  /** Total batches for split withdrawals. */
  batch_total: z.number().int().nullable().optional(),
  /** Creation timestamp. */
  created_at: z.string(),
  /** Approval timestamp. */
  approved_at: z.string().nullable().optional(),
  /** Completion timestamp. */
  completed_at: z.string().nullable().optional(),
  /** Last update timestamp. */
  updated_at: z.string().nullable().optional(),
})

export type PayoutResponse = z.infer<typeof PayoutResponseSchema>

/** Response containing paginated list of payouts/withdrawals */
export const PayoutListResponseSchema = z.object({
  /** Total number of payouts matching the query criteria, across all pages. */
  total: z.number().int().optional(),
  /** Array of payout objects for the current page */
  items: z.array(PayoutResponseSchema).optional(),
})

export type PayoutListResponse = z.infer<typeof PayoutListResponseSchema>

/** Supported payment rail option */
export const PaymentRailOptionSchema = z.object({
  /** Rail identifier. Use this value as the 'payment_rail' parameter when creating quotes. */
  id: z.string(),
  /** Human-readable rail name */
  name: z.string().nullable().optional(),
  /** Whether the rail is currently active and available for use */
  active: z.boolean().nullable().optional(),
})

export type PaymentRailOption = z.infer<typeof PaymentRailOptionSchema>

/** Response containing available rails for a method and currency. */
export const PaymentRailsResponseSchema = z.object({
  /** Payment method requested. */
  payment_method: z.string(),
  /** Currency requested. */
  currency: z.string(),
  /** Resolved country code for this rail lookup. */
  country_code: z.string().nullable().optional(),
  /** Available rails for this method and currency. */
  rails: z.array(PaymentRailOptionSchema),
})

export type PaymentRailsResponse = z.infer<typeof PaymentRailsResponseSchema>

export const ConversionQuoteRequestSchema = z.object({
  /** Currency to convert from (must be a settlement currency: USD or NGN) */
  from_currency: z.string(),
  /** Currency to convert to (must be a settlement currency: USD or NGN) */
  to_currency: z.string(),
  /** Amount to convert as a decimal string */
  amount: z.string(),
})

export type ConversionQuoteRequest = z.infer<typeof ConversionQuoteRequestSchema>

/** Response containing conversion quote with exchange rate and amounts */
export const ConversionQuoteResponseSchema = z.object({
  /** Unique identifier for this conversion quote. Use this ID when executing the conversion. */
  quote_id: z.string(),
  /** Currency being converted from */
  from_currency: z.string(),
  /** Currency being converted to */
  to_currency: z.string(),
  /** Amount in from_currency as a decimal string */
  from_amount: z.string(),
  /** Amount in to_currency as a decimal string */
  to_amount: z.string(),
  /** Exchange rate applied (1 from_currency = X to_currency) */
  exchange_rate: z.string(),
  /** ISO 8601 timestamp when this quote expires */
  expires_at: z.string(),
})

export type ConversionQuoteResponse = z.infer<typeof ConversionQuoteResponseSchema>

export const ConversionCreateRequestSchema = z.object({
  /** Currency to convert from (must match the quote) */
  from_currency: z.string(),
  /** Currency to convert to (must match the quote) */
  to_currency: z.string(),
  /** Amount to convert as a decimal string (must match the quote) */
  amount: z.string(),
  /** Quote ID from the create conversion quote endpoint */
  quote_id: z.string(),
})

export type ConversionCreateRequest = z.infer<typeof ConversionCreateRequestSchema>

/** Response containing executed conversion details */
export const ConversionResponseSchema = z.object({
  /** Unique identifier for this conversion transaction */
  conversion_id: z.string(),
  /**
   * Status of the conversion. `pending` = in progress (typically seconds to minutes);
   * `completed` = conversion successful and rate is final; `failed` = conversion could not be
   * completed.
   */
  status: caseInsensitiveEnum(['pending', 'completed', 'failed']),
  /** Currency that was converted from */
  from_currency: z.string(),
  /** Currency that was converted to */
  to_currency: z.string(),
  /** Amount converted from as a decimal string */
  from_amount: z.string(),
  /** Amount converted to as a decimal string */
  to_amount: z.string(),
  /** Exchange rate that was applied */
  exchange_rate: z.string(),
  /** ISO 8601 timestamp when the conversion was executed */
  created_at: z.string(),
  /** Quote identifier used for this conversion, if conversion was executed from a quote. */
  quote_id: z.string().nullable().optional(),
  /** Optional metadata associated with the conversion. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export type ConversionResponse = z.infer<typeof ConversionResponseSchema>

export const ConversionListResponseSchema = z.object({
  /** Total number of conversions that match the filter criteria. */
  total: z.number().int(),
  /** Maximum number of conversion records returned in this page. */
  limit: z.number().int(),
  /** Number of conversion records skipped before this page. */
  offset: z.number().int(),
  /** Paginated conversion records. */
  items: z.array(ConversionResponseSchema),
})

export type ConversionListResponse = z.infer<typeof ConversionListResponseSchema>

/** Response containing organization details, settings, and configuration */
export const OrganizationResponseSchema = z.object({
  /** Unique identifier for this organization. */
  id: z.string().optional(),
  /** Organization name as registered. */
  name: z.string().nullable().optional(),
  /** User ID of the organization owner. */
  owner_user_id: z.string().optional(),
  /** Parent organization ID if this is a connected account. Null for main organizations. */
  parent_organization_id: z.string().nullable().optional(),
  /** Current onboarding status. Possible values: PENDING, IN_PROGRESS, COMPLETED. */
  onboarding_status: z.string().optional(),
  /**
   * Payment processing status. Must be ENABLED to process payments. Possible values: DISABLED,
   * ENABLED.
   */
  payments_status: z.string().optional(),
  /** ISO country code where the organization is based (e.g., 'NG', 'GH', 'US'). */
  country: z.string().nullable().optional(),
  /**
   * Fee handling mode. 'org_pays_fee' means your organization pays fees (you receive amount
   * minus fees). 'customer_pays_fee' means customer pays fees (customer pays amount plus fees,
   * you receive full amount).
   */
  fee_handling: caseInsensitiveEnum(['org_pays_fee', 'customer_pays_fee']).optional(),
  /**
   * Configuration of which payment methods are enabled for your organization. Each method
   * shows if it's enabled and which currencies it supports.
   */
  enabled_payment_methods: z.record(z.string(), z.object({
    /** Whether this payment method is enabled for your organization */
    enabled: z.boolean().optional(),
    /** List of currency codes this payment method supports */
    currencies: z.array(z.string()).optional(),
  })).nullable().optional(),
  /** Whether the organization is active. Inactive organizations cannot process payments. */
  is_active: z.boolean().optional(),
  /** ISO 8601 timestamp when the organization was created. */
  created_at: z.string().optional(),
  /** ISO 8601 timestamp when the organization was last updated. */
  updated_at: z.string().optional(),
})

export type OrganizationResponse = z.infer<typeof OrganizationResponseSchema>

/** Standard error response format used across all API endpoints */
export const ErrorSchema = z.object({
  /** Human-readable error message explaining what went wrong. */
  detail: z.string(),
  /**
   * Machine-readable error code. Use this to handle errors programmatically. Common codes:
   * VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, TOO_MANY_REQUESTS,
   * INTERNAL_SERVER_ERROR, BAD_GATEWAY, SERVICE_UNAVAILABLE.
   */
  error_code: z.string(),
  /** Optional array of field-level validation errors. Only present for validation errors (400). */
  errors: z.array(z.object({
    /** The field that failed validation. */
    field: z.string(),
    /** Description of the validation failure. */
    message: z.string(),
    /** Error type identifier. */
    type: z.string(),
  })).optional(),
})

export type Error = z.infer<typeof ErrorSchema>

/** Payout currencies supported for a specific method. */
export const SupportedPayoutCurrenciesByMethodResponseSchema = z.object({
  /** Requested payout method, normalized to uppercase. */
  method: z.string(),
  /** Currencies available for this payout method. */
  currencies: z.array(z.string()),
})

export type SupportedPayoutCurrenciesByMethodResponse = z.infer<typeof SupportedPayoutCurrenciesByMethodResponseSchema>

export const DeletePayoutDestinationResponseSchema = z.object({
  /** Boolean result indicating whether the destination was successfully deactivated. */
  success: z.boolean(),
  /** Human-readable confirmation message. */
  message: z.string(),
})

export type DeletePayoutDestinationResponse = z.infer<typeof DeletePayoutDestinationResponseSchema>

/** Summary representation of a dispute record. */
export const DisputeSummarySchema = z.object({
  /** Unique dispute identifier. */
  dispute_id: z.string(),
  /** Associated payment/charge identifier, if linked. */
  charge_id: z.string().nullable().optional(),
  /** Disputed amount as a decimal string. */
  amount: z.string(),
  /** ISO 4217 currency code for the disputed amount. */
  currency: z.string(),
  /** Current dispute status. */
  status: caseInsensitiveEnum(['needs_response', 'under_review', 'won', 'lost', 'closed']),
  /** Whether evidence can still be updated and submitted. */
  is_response_editable: z.boolean(),
  /** Dispute reason code reported by the payment network. */
  reason: z.string().nullable().optional(),
  /** Evidence submission deadline in ISO 8601 format. */
  response_deadline_at: z.string().nullable().optional(),
  /** Dispute creation timestamp. */
  created_at: z.string(),
  /** Most recent update timestamp. */
  updated_at: z.string(),
})

export type DisputeSummary = z.infer<typeof DisputeSummarySchema>

/** Paginated dispute list response. */
export const DisputeListResponseSchema = z.object({
  /** Total number of disputes matching the query. */
  total: z.number().int(),
  /** Dispute records for the requested page. */
  items: z.array(DisputeSummarySchema),
})

export type DisputeListResponse = z.infer<typeof DisputeListResponseSchema>

/** Evidence fields attached to a dispute response. */
export const DisputeEvidenceSchema = z.object({
  /** An access or activity log showing the customer used what they paid for. */
  access_activity_log: z.string().optional(),
  /** Customer's billing address. */
  billing_address: z.string().nullable().optional(),
  /** Upload id of your cancellation policy document. */
  cancellation_policy_attachment_id: z.string().optional(),
  /** Cancellation policy shown to the customer. */
  cancellation_policy_disclosure: z.string().nullable().optional(),
  /** Uploaded customer communication document identifier. */
  customer_communication_attachment_id: z.string().nullable().optional(),
  /** Email address of the customer. */
  customer_email_address: z.string().nullable().optional(),
  /** Full name of the customer. */
  customer_name: z.string().nullable().optional(),
  /** Additional context supporting the dispute response. */
  notes: z.string().nullable().optional(),
  /** Description of delivered goods or services. */
  product_description: z.string().nullable().optional(),
  /** Upload id of your refund policy document. */
  refund_policy_attachment_id: z.string().optional(),
  /** Refund policy shown to the customer. */
  refund_policy_disclosure: z.string().nullable().optional(),
  /** Reason a refund was not granted. */
  refund_refusal_explanation: z.string().nullable().optional(),
  /** Date the service was delivered. */
  service_date: z.string().nullable().optional(),
  /** Uploaded supporting document identifier. */
  uncategorized_attachment_id: z.string().nullable().optional(),
})

export type DisputeEvidence = z.infer<typeof DisputeEvidenceSchema>

/** Metadata for a dispute evidence submission attempt. */
export const DisputeSubmissionSchema = z.object({
  /** Unique identifier for this submission attempt. */
  submission_id: z.string(),
  /** Submission delivery status. */
  status: z.string(),
  /** What triggered the submission attempt. */
  trigger_source: z.string(),
  /** Timestamp when submission was delivered. */
  submitted_at: z.string().nullable().optional(),
  /** Timestamp when submission failed, if applicable. */
  failed_at: z.string().nullable().optional(),
  /** Submission attempt sequence number. */
  attempt_sequence: z.number().int(),
})

export type DisputeSubmission = z.infer<typeof DisputeSubmissionSchema>

/** Detailed dispute payload including evidence and latest submission metadata. */
export const DisputeResponseSchema = z.object({
  /** Unique dispute identifier. */
  dispute_id: z.string(),
  /** Associated payment/charge identifier, if linked. */
  charge_id: z.string().nullable().optional(),
  /** Disputed amount as a decimal string. */
  amount: z.string(),
  /** ISO 4217 currency code for the disputed amount. */
  currency: z.string(),
  /** Current dispute status. */
  status: caseInsensitiveEnum(['needs_response', 'under_review', 'won', 'lost', 'closed']),
  /** Whether evidence is still editable for this dispute. */
  is_response_editable: z.boolean(),
  /** Dispute reason code reported by the payment network. */
  reason: z.string().nullable().optional(),
  /** Evidence submission deadline in ISO 8601 format. */
  response_deadline_at: z.string().nullable().optional(),
  evidence: DisputeEvidenceSchema,
  /** Most recent submission attempt for this dispute. */
  latest_submission: DisputeSubmissionSchema.nullable().optional(),
  /** Dispute creation timestamp. */
  created_at: z.string(),
  /** Most recent update timestamp. */
  updated_at: z.string(),
})

export type DisputeResponse = z.infer<typeof DisputeResponseSchema>

/** Successful dispute document upload response. */
export const DisputeDocumentUploadResponseSchema = z.object({
  /** Uploaded document identifier. */
  document_id: z.string(),
  /** Original uploaded filename. */
  file_name: z.string(),
  /** Detected MIME type of the uploaded file. */
  mime_type: z.string(),
  /** Uploaded file size in bytes. */
  file_size_bytes: z.number().int(),
  /** Internal storage provider label. */
  storage_provider: z.string(),
  /** Upload completion timestamp. */
  uploaded_at: z.string(),
})

export type DisputeDocumentUploadResponse = z.infer<typeof DisputeDocumentUploadResponseSchema>

/** Fields used to create or update dispute evidence. Include only fields that should change. */
export const DisputeEvidenceUpdateRequestSchema = z.object({
  /** An access or activity log showing the customer used what they paid for. */
  access_activity_log: z.string().optional(),
  /** Customer's billing address. */
  billing_address: z.string().optional(),
  /** Upload id of your cancellation policy document. */
  cancellation_policy_attachment_id: z.string().optional(),
  /** Cancellation policy shown to the customer. */
  cancellation_policy_disclosure: z.string().optional(),
  /** Uploaded customer communication document identifier. */
  customer_communication_attachment_id: z.string().optional(),
  /** Email address of the customer. */
  customer_email_address: z.string().optional(),
  /** Full name of the customer. */
  customer_name: z.string().optional(),
  /** Additional context supporting the dispute response. */
  notes: z.string().optional(),
  /** Description of delivered goods or services. */
  product_description: z.string().optional(),
  /** Upload id of your refund policy document. */
  refund_policy_attachment_id: z.string().optional(),
  /** Refund policy shown to the customer. */
  refund_policy_disclosure: z.string().optional(),
  /** Reason a refund was not granted. */
  refund_refusal_explanation: z.string().optional(),
  /** Date the service was delivered. */
  service_date: z.string().optional(),
  /** Uploaded supporting document identifier. */
  uncategorized_attachment_id: z.string().optional(),
})

export type DisputeEvidenceUpdateRequest = z.infer<typeof DisputeEvidenceUpdateRequestSchema>

/** Response after saving dispute evidence fields. */
export const DisputeEvidenceUpdateResponseSchema = z.object({
  /** The dispute that was updated. */
  dispute_id: z.string(),
  /** Current dispute status after update. */
  status: z.string(),
  /** Whether the dispute is still editable after update. */
  is_response_editable: z.boolean(),
  /** Timestamp when evidence was last updated. */
  evidence_updated_at: z.string(),
})

export type DisputeEvidenceUpdateResponse = z.infer<typeof DisputeEvidenceUpdateResponseSchema>

/** Response returned after submitting dispute evidence for review. */
export const DisputeSubmitResponseSchema = z.object({
  /** The dispute that was submitted. */
  dispute_id: z.string(),
  /** Updated dispute status after submission. */
  status: z.string(),
  /** Whether the dispute remains editable after submission. */
  is_response_editable: z.boolean(),
  /** Metadata for the submission attempt created by this request. */
  submission: z.object({
    /** Unique identifier for this submission attempt. */
    submission_id: z.string(),
    /** Submission delivery outcome. */
    submission_status: z.string(),
    /** Source of submission trigger. */
    trigger_source: z.string(),
    /** Timestamp when submission was delivered. */
    submitted_at: z.string().nullable().optional(),
  }),
})

export type DisputeSubmitResponse = z.infer<typeof DisputeSubmitResponseSchema>

export const MediaItemResponseSchema = z.object({
  id: z.string().optional(),
  url: z.string().nullable().optional(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size_bytes: z.number().int().optional(),
  created_at: z.string().optional(),
})

export type MediaItemResponse = z.infer<typeof MediaItemResponseSchema>

export const CurrencyOptionInputSchema = z.object({
  /**
   * A supported additional currency (`GHS`, `KES`, `UGX`, `TZS`, `RWF`, `XAF`, `XOF`, `ZMW`).
   * Cannot be the primary currency.
   */
  currency: z.string(),
  /**
   * Price as a decimal string, e.g. `"29.00"`. Required when `price_type` is `fixed`. Omit for
   * `free` and `custom`.
   */
  amount: z.string().nullable().optional(),
  /**
   * Suggested amount prefilled at checkout for a custom price in this currency, as a decimal
   * string. Only used when `price_type` is `custom`.
   */
  preset_amount: z.string().nullable().optional(),
  /**
   * Least the customer can pay, as a decimal string. Only used when `price_type` is `custom`.
   * Set `"0.00"` to allow free (pay what you want).
   */
  minimum_amount: z.string().nullable().optional(),
  /** Most the customer can pay, as a decimal string. Only used when `price_type` is `custom`. */
  maximum_amount: z.string().nullable().optional(),
})

export type CurrencyOptionInput = z.infer<typeof CurrencyOptionInputSchema>

export const PriceInputSchema = z.object({
  /** The product's primary currency. Must be `USD` or `NGN`. */
  currency: caseInsensitiveEnum(['USD', 'NGN']),
  /**
   * How the product is priced. `fixed`: a set amount, given in `amount`. `free`: no charge.
   * `custom`: the customer pays what they want, bounded by `minimum_amount` and
   * `maximum_amount` with an optional `preset_amount` suggestion.
   */
  price_type: caseInsensitiveEnum(['fixed', 'free', 'custom']).optional(),
  /**
   * Price as a decimal string, e.g. `"29.00"`. Required when `price_type` is `fixed`. Omit for
   * `free` and `custom`.
   */
  amount: z.string().nullable().optional(),
  /**
   * Suggested amount prefilled at checkout for a custom price, as a decimal string. Only used
   * when `price_type` is `custom`.
   */
  preset_amount: z.string().nullable().optional(),
  /**
   * Least the customer can pay, as a decimal string. Only used when `price_type` is `custom`.
   * Set `"0.00"` to allow free (pay what you want).
   */
  minimum_amount: z.string().nullable().optional(),
  /** Most the customer can pay, as a decimal string. Only used when `price_type` is `custom`. */
  maximum_amount: z.string().nullable().optional(),
  /**
   * Prices in other currencies. Each entry sets a price for one additional currency, and
   * cannot repeat the primary currency.
   */
  currency_options: z.array(CurrencyOptionInputSchema).nullable().optional(),
})

export type PriceInput = z.infer<typeof PriceInputSchema>

export const SubscriptionCadenceSchema = z.object({
  /**
   * Unit of time for each billing cycle. `day`: billed daily. `week`: billed weekly. `month`:
   * billed monthly. `year`: billed yearly.
   */
  interval: caseInsensitiveEnum(['day', 'week', 'month', 'year']).optional(),
  /**
   * Number of intervals per cycle. For example, `interval` `month` with `frequency` `3` bills
   * every three months.
   */
  frequency: z.number().int().optional(),
})

export type SubscriptionCadence = z.infer<typeof SubscriptionCadenceSchema>

/**
 * The length of the free trial before the first charge, expressed as a count of time units.
 * For example, `{ "interval": "day", "frequency": 14 }` is a 14-day trial.
 */
export const TrialPeriodSchema = z.object({
  /** The unit of time the trial is measured in: `day`, `week`, `month`, or `year`. */
  interval: caseInsensitiveEnum(['day', 'week', 'month', 'year']),
  /**
   * How many `interval` units the trial lasts. For example, `interval` `day` with `frequency`
   * `14` is a 14-day trial.
   */
  frequency: z.number().int(),
})

export type TrialPeriod = z.infer<typeof TrialPeriodSchema>

export const CreateProductRequestSchema = z.object({
  /** Display name of the product. Shown to customers at checkout. */
  name: z.string(),
  /** Optional description of the product. Shown to customers at checkout. */
  description: z.string().nullable().optional(),
  /** Primary price for the product. Provide an `amount` as a decimal string and a `currency`. */
  price: PriceInputSchema,
  /** Up to 20 key/value pairs for your own reference. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * How often the product bills. Provide a cadence to make the product recurring, or omit it
   * for a one-time product.
   */
  billing_cycle: SubscriptionCadenceSchema.nullable().optional(),
  /**
   * A free trial before the first charge, given as a duration like `{ "interval": "day",
   * "frequency": 14 }` for 14 days. The customer isn't charged until the trial ends. Only
   * valid on a recurring product. Currently in beta.
   */
  trial_period: TrialPeriodSchema.nullable().optional(),
})

export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>

export const UpdatePriceInputSchema = z.object({
  /**
   * New price as a decimal in the major unit (e.g. `39.00`). Only valid for fixed-price
   * products.
   */
  amount: z.string().nullable().optional(),
  /** Full replacement of multi-currency prices. Omit to leave unchanged. */
  currency_options: z.array(CurrencyOptionInputSchema).nullable().optional(),
})

export type UpdatePriceInput = z.infer<typeof UpdatePriceInputSchema>

export const UpdateProductRequestSchema = z.object({
  /** New display name for the product. */
  name: z.string().optional(),
  /** New description for the product. */
  description: z.string().nullable().optional(),
  /** Replace the product's key-value metadata. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Ordered list of upload IDs. Replaces existing media. */
  media: z.array(z.string()).optional(),
  /** Price fields to update. Omit to leave price unchanged. */
  price: UpdatePriceInputSchema.nullable().optional(),
  /**
   * How often the product bills. Provide a cadence to make the product recurring, or omit it
   * for a one-time product.
   */
  billing_cycle: SubscriptionCadenceSchema.nullable().optional(),
  /**
   * A free trial before the first charge, given as a duration like `{ "interval": "day",
   * "frequency": 14 }` for 14 days. The customer isn't charged until the trial ends. Only
   * valid on a recurring product. Currently in beta.
   */
  trial_period: TrialPeriodSchema.nullable().optional(),
})

export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>

export const CurrencyOptionResponseSchema = z.object({
  currency: z.string().optional(),
  amount: z.string().optional(),
  minimum_amount: z.string().nullable().optional(),
  maximum_amount: z.string().nullable().optional(),
})

export type CurrencyOptionResponse = z.infer<typeof CurrencyOptionResponseSchema>

export const PriceResponseSchema = z.object({
  currency: z.string().optional(),
  /**
   * How the product is priced. `fixed`: a set amount, given in `amount`. `free`: no charge.
   * `custom`: the customer pays what they want, bounded by `minimum_amount` and
   * `maximum_amount` with an optional `preset_amount` suggestion.
   */
  price_type: caseInsensitiveEnum(['fixed', 'free', 'custom']).optional(),
  /** Price in the primary currency as a decimal string. */
  amount: z.string().optional(),
  /**
   * Suggested amount prefilled at checkout for a custom price, as a decimal string. Only used
   * when `price_type` is `custom`.
   */
  preset_amount: z.string().nullable().optional(),
  /** Minimum the customer must pay. Present only when `price_type` is `custom`. */
  minimum_amount: z.string().nullable().optional(),
  /** Maximum the customer may pay. Present only when `price_type` is `custom`. */
  maximum_amount: z.string().nullable().optional(),
  currency_options: z.array(CurrencyOptionResponseSchema).optional(),
})

export type PriceResponse = z.infer<typeof PriceResponseSchema>

export const ProductResponseSchema = z.object({
  /** Unique identifier for the product, prefixed with `prod_`. */
  id: z.string().optional(),
  /** The organization that owns the product. */
  organization_id: z.string().optional(),
  /** Display name of the product. */
  name: z.string().optional(),
  /** Optional description of the product. `null` when not set. */
  description: z.string().nullable().optional(),
  /** Primary price for the product, in the product's default currency. */
  price: PriceResponseSchema.optional(),
  /**
   * Status of the product. `active`: Live and available for use in checkouts and
   * subscriptions. `archived`: Retired. Kept for reference but not available for new
   * purchases.
   */
  status: caseInsensitiveEnum(['active', 'archived']).optional(),
  /** Your own key-value data attached to the product, returned unchanged. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Media items (images) attached to the product. Empty when none are set. */
  media: z.array(MediaItemResponseSchema).optional(),
  /** Identifier of the user or key that created the product. */
  actor_id: z.string().optional(),
  /** ISO 8601 timestamp when the product was created. */
  created_at: z.string().optional(),
  /** ISO 8601 timestamp when the product was last updated. */
  updated_at: z.string().optional(),
  /**
   * When set, the product is archived and cannot be used in new checkouts. `null` while the
   * product is active.
   */
  archived_at: z.string().nullable().optional(),
  /**
   * How often the product bills. Provide a cadence to make the product recurring, or omit it
   * for a one-time product.
   */
  billing_cycle: SubscriptionCadenceSchema.nullable().optional(),
  /**
   * A free trial before the first charge, given as a duration like `{ "interval": "day",
   * "frequency": 14 }` for 14 days. The customer isn't charged until the trial ends. Only
   * valid on a recurring product. Currently in beta.
   */
  trial_period: TrialPeriodSchema.nullable().optional(),
  /**
   * All prices configured on the product, one per currency. Each has `currency`, `amount`,
   * optional `minimum_amount` and `maximum_amount`, and `is_default`.
   */
  prices: z.array(z.record(z.string(), z.unknown())).optional(),
  /**
   * Running count of completed payments for this product. Starts at `0` and increments as
   * customers pay.
   */
  total_payments: z.number().int().optional(),
  /**
   * Running total collected for this product, as a decimal string in the product currency.
   * Starts at `"0.00"`.
   */
  total_amount: z.string().optional(),
})

export type ProductResponse = z.infer<typeof ProductResponseSchema>

export const PaginationResponseSchema = z.object({
  next_cursor: z.string().nullable().optional(),
  prev_cursor: z.string().nullable().optional(),
  has_more: z.boolean().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
  returned: z.number().int().optional(),
  total: z.number().int().optional(),
})

export type PaginationResponse = z.infer<typeof PaginationResponseSchema>

export const ProductListResponseSchema = z.object({
  /** Pagination cursors and counts. See the Pagination guide. */
  pagination: PaginationResponseSchema.optional(),
  /** The products on this page. Each item is a product object. */
  items: z.array(ProductResponseSchema).optional(),
})

export type ProductListResponse = z.infer<typeof ProductListResponseSchema>

export const CreateProductGroupRequestSchema = z.object({
  name: z.string(),
  product_ids: z.array(z.string()),
})

export type CreateProductGroupRequest = z.infer<typeof CreateProductGroupRequestSchema>

export const UpdateProductGroupRequestSchema = z.object({
  name: z.string().optional(),
  /** Full replacement of group membership. */
  product_ids: z.array(z.string()).optional(),
})

export type UpdateProductGroupRequest = z.infer<typeof UpdateProductGroupRequestSchema>

export const ProductGroupResponseSchema = z.object({
  id: z.string().optional(),
  organization_id: z.string().optional(),
  name: z.string().optional(),
  products: z.array(ProductResponseSchema).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export type ProductGroupResponse = z.infer<typeof ProductGroupResponseSchema>

export const ProductGroupListResponseSchema = z.object({
  pagination: PaginationResponseSchema.optional(),
  items: z.array(ProductGroupResponseSchema).optional(),
})

export type ProductGroupListResponse = z.infer<typeof ProductGroupListResponseSchema>

export const UploadResponseSchema = z.object({
  upload_id: z.string().optional(),
  provider: z.string().optional(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size_bytes: z.number().int().optional(),
  url: z.string().nullable().optional(),
  /** Resource type this upload is attached to, e.g. `product`. */
  linked_resource_type: z.string().nullable().optional(),
  /** ID of the resource this upload is attached to. */
  linked_resource_id: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export type UploadResponse = z.infer<typeof UploadResponseSchema>

export const UploadDeleteResponseSchema = z.object({
  upload_id: z.string().optional(),
  deleted: z.boolean().optional(),
})

export type UploadDeleteResponse = z.infer<typeof UploadDeleteResponseSchema>

export const CustomerListItemSchema = z.object({
  /** Unique identifier for the customer, prefixed with `cust_`. */
  customer_id: z.string(),
  /** The customer's email address. */
  email: z.string(),
  /** The customer's full name. `null` when not set. */
  name: z.string().nullable().optional(),
  /** Your own key-value data attached to the customer. */
  metadata: z.record(z.string(), z.unknown()),
  /** ISO 8601 timestamp when the customer was created. */
  created_at: z.string(),
})

export type CustomerListItem = z.infer<typeof CustomerListItemSchema>

export const CustomerListResponseSchema = z.object({
  /** The customers on this page. Each item is a customer object. */
  items: z.array(CustomerListItemSchema),
  /** Pagination cursors and counts. See the Pagination guide. */
  pagination: z.object({
    next_cursor: z.string().nullable().optional(),
    prev_cursor: z.string().nullable().optional(),
    has_more: z.boolean().optional(),
    limit: z.number().int().optional(),
    offset: z.number().int().optional(),
    returned: z.number().int().optional(),
    total: z.number().int().optional(),
  }),
})

export type CustomerListResponse = z.infer<typeof CustomerListResponseSchema>

export const PortalSessionResponseSchema = z.object({
  /**
   * The session identifier, prefixed with `psn_`. Use it to correlate a session with your own
   * logs; it is not a credential and cannot be exchanged for access.
   */
  id: z.string(),
  /**
   * The URL that opens the portal as this customer. It carries the session credential, so it
   * works on any device and must not be logged or shared.
   */
  url: z.string(),
})

export type PortalSessionResponse = z.infer<typeof PortalSessionResponseSchema>

/**
 * A customer's billing address. Treated as one atomic value: on update, a supplied object
 * replaces every component rather than merging with what's stored.
 */
export const CustomerBillingAddressSchema = z.object({
  /** Street address. Required whenever an address is supplied. */
  line1: z.string().nullable().optional(),
  /** Apartment, suite, unit, etc. `null` when not set. */
  line2: z.string().nullable().optional(),
  /** City, district, or suburb. */
  city: z.string().nullable().optional(),
  /** State, province, or region. */
  state: z.string().nullable().optional(),
  /** ZIP or postal code. */
  postal_code: z.string().nullable().optional(),
  /** Two-letter ISO-3166-1 alpha-2 country code. Required whenever an address is supplied. */
  country: z.string().nullable().optional(),
})

export type CustomerBillingAddress = z.infer<typeof CustomerBillingAddressSchema>

export const CustomerDetailResponseSchema = z.object({
  /** Unique identifier for the customer, prefixed with `cust_`. */
  customer_id: z.string(),
  /** The customer's email address. */
  email: z.string(),
  /** The customer's full name. `null` when not set. */
  name: z.string().nullable().optional(),
  /** The customer's phone number in E.164 format, e.g. `+2348012345678`. */
  phone_number: z.string().nullable().optional(),
  /** Your own key-value data attached to the customer. */
  metadata: z.record(z.string(), z.unknown()),
  /** ISO 8601 timestamp when the customer was created. */
  created_at: z.string(),
  /** ISO 8601 timestamp when the customer was last updated. */
  updated_at: z.string(),
  /** The customer's billing address, or `null` if none is set. */
  billing_address: CustomerBillingAddressSchema.nullable().optional(),
})

export type CustomerDetailResponse = z.infer<typeof CustomerDetailResponseSchema>

export const CreateCustomerRequestSchema = z.object({
  /** The customer's email address. Used to identify the customer and send receipts. */
  email: z.string(),
  /**
   * The customer's full name. Derived from `first_name` and `last_name` when those are
   * provided instead.
   */
  name: z.string().nullable().optional(),
  /** The customer's phone number in E.164 format, e.g. `+2348012345678`. */
  phone_number: z.string().nullable().optional(),
  /** Your own key-value data attached to the customer, returned unchanged. */
  metadata: z.record(z.string(), z.unknown()).optional(),
  /**
   * The customer's billing address. Optional on create. `line1` and `country` are required
   * whenever an address is supplied; `country` must be a real ISO-3166-1 alpha-2 code. An
   * all-empty object is rejected; omit the field or send `null` instead.
   */
  billing_address: CustomerBillingAddressSchema.nullable().optional(),
})

export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>

export const UpdateCustomerRequestSchema = z.object({
  /** The customer's email address. Used to identify the customer and send receipts. */
  email: z.string().nullable().optional(),
  /**
   * The customer's full name. Derived from `first_name` and `last_name` when those are
   * provided instead.
   */
  name: z.string().nullable().optional(),
  /** The customer's phone number in E.164 format, e.g. `+2348012345678`. */
  phone_number: z.string().nullable().optional(),
  /** Your own key-value data attached to the customer, returned unchanged. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * Omit this field to leave the billing address untouched. Send `null` to clear it. Send an
   * object to replace it in full. This is not a merge, so any component you leave out of the
   * object becomes `null`, even if a value was previously stored. `line1` and `country` are
   * required whenever an object is supplied, and an all-empty object is rejected; use explicit
   * `null` to clear the address instead. `na...
   */
  billing_address: CustomerBillingAddressSchema.nullable().optional(),
})

export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>

/** A resolved product line item within a checkout session. */
export const ResolvedProductItemSchema = z.object({
  /** Product identifier. */
  product_id: z.string(),
  /** Product display name. */
  product_name: z.string(),
  /** Number of units. */
  quantity: z.number().int(),
  /** Price per unit in `currency`. */
  unit_amount: z.string(),
  /** Currency code for this line item. */
  currency: z.string(),
  /**
   * How the product is priced. `fixed`: a set amount, given in `amount`. `free`: no charge.
   * `custom`: the customer pays what they want, bounded by `minimum_amount` and
   * `maximum_amount` with an optional `preset_amount` suggestion.
   */
  price_type: caseInsensitiveEnum(['fixed', 'free', 'custom']),
  /** Minimum allowed amount when `price_type` is true. */
  minimum_amount: z.string().nullable().optional(),
  /** Maximum allowed amount when `price_type` is true. */
  maximum_amount: z.string().nullable().optional(),
  /** Total for this line item (`unit_amount` × `quantity`). */
  line_total: z.string(),
})

export type ResolvedProductItem = z.infer<typeof ResolvedProductItemSchema>

/** A product line item purchased in this payment. */
export const PaymentProductItemSchema = z.object({
  /** Product identifier. */
  product_id: z.string(),
  /** Product display name. */
  product_name: z.string(),
  /** Number of units purchased. */
  quantity: z.number().int(),
  /** Price per unit in `currency`. */
  unit_amount: z.string(),
  /** Currency code for this line item. */
  currency: z.string(),
  /** Total for this line item (`unit_amount` × `quantity`). */
  line_total: z.string(),
})

export type PaymentProductItem = z.infer<typeof PaymentProductItemSchema>

/** A subscription invoice this payment collected. */
export const PaymentInvoiceInfoSchema = z.object({
  /** The invoice's identifier. */
  invoice_id: z.string(),
  /** Human-facing invoice number, if assigned. */
  number: z.string().nullable().optional(),
  /** The subscription the invoice belongs to. */
  subscription_id: z.string().nullable().optional(),
  /** Start of the billing period, UTC. */
  period_start: z.string().optional(),
  /** End of the billing period, UTC. */
  period_end: z.string().optional(),
  /**
   * `cycle`: a regular subscription-period invoice. `proration`: an off-cycle mid-cycle
   * change.
   */
  kind: caseInsensitiveEnum(['cycle', 'proration']).optional(),
})

export type PaymentInvoiceInfo = z.infer<typeof PaymentInvoiceInfoSchema>

/** Detailed payment response for API integrations. */
export const PaymentResponseSchema = z.object({
  /** Checkout reference when available. */
  reference: z.string().nullable().optional(),
  /** Unique identifier for the payment. */
  payment_id: z.string().optional(),
  /**
   * Why this payment exists. `purchase`: a one-time purchase. `subscription_create`: the first
   * cycle of a new subscription. `subscription_cycle`: a subscription renewal.
   * `subscription_update`: an off-cycle charge from a mid-cycle plan change (proration).
   */
  billing_reason: caseInsensitiveEnum(['purchase', 'subscription_create', 'subscription_cycle', 'subscription_update']).optional(),
  /** Checkout identifier, when linked. */
  checkout_id: z.string().nullable().optional(),
  /** payment status. */
  status: caseInsensitiveEnum(['created', 'processing', 'succeeded', 'accepted', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded', 'underpaid', 'overpaid']),
  /** Whether this payment can currently be refunded. */
  is_refundable: z.boolean().nullable().optional(),
  /** Requested amount in `currency`. */
  amount: z.string(),
  /** Amount received so far. */
  amount_paid: z.string().nullable().optional(),
  /** Remaining amount still expected. */
  amount_remaining: z.string().nullable().optional(),
  /** Payment currency code. */
  currency: z.string(),
  /**
   * Processing fee for this payment, converted to USD and expressed as a decimal string.
   * `null` until the payment settles.
   */
  fee_usd: z.string().nullable().optional(),
  /** Whether merchant bears processing cost. */
  merchant_bears_cost: z.boolean().nullable().optional(),
  /** Payment method used for this payment. */
  payment_method: z.string().nullable().optional(),
  /** Origin channel (for example `api`). */
  channel: z.string().nullable().optional(),
  /** payment description/narration. */
  narration: z.string().nullable().optional(),
  /** Public metadata stored for this payment. */
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Human-readable payment message derived from status. */
  message: z.string().nullable().optional(),
  /** Customer information when available. */
  customer: z.object({
    /** Full name of the customer associated with this payment, when captured. */
    name: z.string().nullable().optional(),
    /** Customer email address associated with this payment, when captured. */
    email: z.string().nullable().optional(),
  }).nullable().optional(),
  /** The line items this payment covers. */
  line_items: z.array(PaymentProductItemSchema).nullable().optional(),
  /** The subscription this payment belongs to, or `null` for a one-time purchase. */
  subscription_id: z.string().nullable().optional(),
  /**
   * The invoice this payment collected. Present only for subscription payments; `null` for
   * one-time purchases.
   */
  invoice: PaymentInvoiceInfoSchema.nullable().optional(),
  /** IDs of any refunds issued for this payment. `null` if no refund has been created. */
  refunds: z.array(z.string()).nullable().optional(),
  /** Chronological list of status changes for this payment. */
  status_history: z.array(z.object({
    /** Status at this point in time. */
    status: z.string().optional(),
    /** When this status change occurred. */
    occurred_at: z.string().optional(),
    /** Provider-side reference for this transition. */
    provider_reference: z.string().nullable().optional(),
    /** Human-readable reason for the status change, if available. */
    reason: z.string().nullable().optional(),
  })).nullable().optional(),
  /** Creation timestamp. */
  created_at: z.string(),
  /** Last update timestamp. */
  updated_at: z.string(),
  /** Completion timestamp when available. */
  completed_at: z.string().nullable().optional(),
})

export type PaymentResponse = z.infer<typeof PaymentResponseSchema>

/** Checkout details returned by `GET /v1/checkouts/{checkout_id}`. */
export const CheckoutResponseSchema = z.object({
  /** Unique checkout identifier. */
  checkout_id: z.string(),
  /**
   * Current lifecycle status of the checkout. `OPEN`: Awaiting customer payment. New checkouts
   * start here. `COMPLETED`: Payment succeeded. This is a terminal state. `EXPIRED`: The
   * checkout window elapsed before payment. This is a terminal state. `CANCELLED`: Canceled
   * before completion. This is a terminal state.
   */
  status: caseInsensitiveEnum(['OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED']),
  /**
   * How the checkout was created. `API`: Created directly through the API. `CHECKOUT_SESSION`:
   * Created from a checkout session. `PAYMENT_LINK`: Created from a shareable payment link.
   */
  source_type: caseInsensitiveEnum(['API', 'CHECKOUT_SESSION', 'PAYMENT_LINK']),
  /** Requested amount in `currency`. */
  amount: z.string(),
  /** Base currency code. */
  currency: z.string(),
  /** Merchant-supplied or auto-generated reference. */
  reference: z.string().nullable().optional(),
  /**
   * The charge created when the customer submitted payment. `null` while the checkout is still
   * `OPEN`.
   */
  charge: PaymentResponseSchema.nullable().optional(),
  /** Customer email address. */
  customer_email: z.string(),
  /** Customer full name. */
  customer_name: z.string().nullable().optional(),
  /** Linked customer ID, if the checkout was created with an existing customer. */
  customer_id: z.string().nullable().optional(),
  /** URL the customer is redirected to after successful payment. */
  success_url: z.string().nullable().optional(),
  /** URL the customer is redirected to if they cancel. */
  cancel_url: z.string().nullable().optional(),
  /** Public metadata you attached at checkout creation. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** ISO 8601 creation timestamp. */
  created_at: z.string(),
  /** ISO 8601 expiry timestamp. */
  expires_at: z.string().nullable().optional(),
  /** ISO 8601 timestamp when the checkout was completed. */
  completed_at: z.string().nullable().optional(),
  /** ISO 8601 last-updated timestamp. */
  updated_at: z.string(),
})

export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>

/**
 * The recurring cadence when the checkout starts a subscription. `null` for a one-time
 * checkout.
 */
export const CheckoutRecurringSchema = z.object({
  /** The billing interval. */
  interval: caseInsensitiveEnum(['day', 'week', 'month', 'year']),
  /** Number of intervals per billing cycle. */
  interval_count: z.number().int().optional(),
})

export type CheckoutRecurring = z.infer<typeof CheckoutRecurringSchema>

/** The customer attached to the checkout. */
export const CheckoutCustomerSchema = z.object({
  /** The customer's ID, once resolved. `null` until a customer is matched or created. */
  id: z.string().nullable().optional(),
  /** The customer's email address. */
  email: z.string(),
  /** The customer's name. `null` when not provided. */
  name: z.string().nullable().optional(),
})

export type CheckoutCustomer = z.infer<typeof CheckoutCustomerSchema>

/** Checkout session details returned by `GET /v1/checkout-sessions/{checkout_id}`. */
export const CheckoutSessionApiResponseSchema = z.object({
  /** Unique checkout identifier. */
  checkout_id: z.string(),
  /**
   * Current lifecycle status of the checkout session. `OPEN`: Awaiting customer payment. New
   * sessions start here. `COMPLETED`: Payment succeeded. This is a terminal state. `EXPIRED`:
   * The session window elapsed before payment. This is a terminal state. `CANCELLED`: Canceled
   * before completion. This is a terminal state.
   */
  status: caseInsensitiveEnum(['OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED']),
  /** Present only for a subscription checkout; `null` for a one-time checkout. */
  recurring: CheckoutRecurringSchema.nullable().optional(),
  /**
   * Payment lifecycle for the checkout. `requires_payment_method`, `requires_confirmation`,
   * `requires_action`, `processing`, `succeeded`, `failed`, or `canceled`.
   */
  payment_status: caseInsensitiveEnum(['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled']).nullable().optional(),
  /** What created the checkout, e.g. `CHECKOUT_SESSION` or `API`. */
  source_type: z.string().nullable().optional(),
  /** Total amount in `currency`. */
  amount: z.string(),
  /** Base currency code. */
  currency: z.string(),
  /** Merchant-supplied or auto-generated reference. */
  reference: z.string().nullable().optional(),
  /** The payment created by this checkout, once payment has been attempted. `null` before then. */
  charge: PaymentResponseSchema.nullable().optional(),
  /** The payment method selected for the checkout, if any. */
  payment_method: z.string().nullable().optional(),
  customer: CheckoutCustomerSchema.optional(),
  /** URL the customer is redirected to after successful payment. */
  success_url: z.string().nullable().optional(),
  /** URL the customer is redirected to if they cancel. */
  cancel_url: z.string().nullable().optional(),
  /**
   * Resolved product line items. Populated for `CART` sessions; may be `null` for `SELECTION`
   * sessions before the customer picks a product.
   */
  products: z.array(ResolvedProductItemSchema).nullable().optional(),
  /** Currency the customer selected for billing. */
  billing_currency: z.string().nullable().optional(),
  /**
   * How products are presented. `CART` sums a fixed set of items; `SELECTION` lets the
   * customer pick one from a group.
   */
  session_mode: caseInsensitiveEnum(['CART', 'SELECTION']).nullable().optional(),
  /** Public metadata you attached at session creation. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** ISO 8601 creation timestamp. */
  created_at: z.string(),
  /** ISO 8601 expiry timestamp. */
  expires_at: z.string().nullable().optional(),
  /** ISO 8601 timestamp when the session was completed. */
  completed_at: z.string().nullable().optional(),
  /** ISO 8601 last-updated timestamp. */
  updated_at: z.string(),
})

export type CheckoutSessionApiResponse = z.infer<typeof CheckoutSessionApiResponseSchema>

export const SubscriptionCatalogProductSchema = z.object({
  /** Unique identifier for the product. */
  id: z.string().optional(),
  /** The product's name, shown to customers at checkout. */
  name: z.string().optional(),
  /** The product's description. `null` if none was set. */
  description: z.string().nullable().optional(),
  /** Whether the product is active or archived. */
  status: z.string().optional(),
  billing_cycle: SubscriptionCadenceSchema.nullable().optional(),
  trial_period: TrialPeriodSchema.nullable().optional(),
  /** When the product was created, in UTC. */
  created_at: z.string().optional(),
  /** When the product was last updated, in UTC. */
  updated_at: z.string().optional(),
})

export type SubscriptionCatalogProduct = z.infer<typeof SubscriptionCatalogProductSchema>

export const SubscriptionItemPriceSchema = z.object({
  /** Unique identifier for the price. */
  id: z.string().optional(),
  /** The product this price belongs to. */
  product_id: z.string().optional(),
  /**
   * How this line item is priced. `fixed`: a set price per cycle, the same for every customer.
   * `free`: no charge. `custom`: the customer chose the amount at checkout, within the
   * product's bounds.
   */
  price_type: caseInsensitiveEnum(['fixed', 'free', 'custom']).optional(),
  /** The currency of this price, as an ISO 4217 code. */
  currency: z.string().optional(),
  /** Decimal string at the currency's precision */
  unit_amount: z.string().optional(),
  billing_cycle: SubscriptionCadenceSchema.nullable().optional(),
  trial_period: TrialPeriodSchema.nullable().optional(),
  /** Reserved for seat-based pricing. `null` for the standard pricing available today. */
  seat_tiers: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * Whether the price has been archived. Archived prices keep billing existing subscribers but
   * are not offered for new checkouts.
   */
  is_archived: z.boolean().optional(),
  /** When the price was created, in UTC. */
  created_at: z.string().optional(),
  /** When the price was last updated, in UTC. */
  updated_at: z.string().optional(),
})

export type SubscriptionItemPrice = z.infer<typeof SubscriptionItemPriceSchema>

export const SubscriptionItemSchema = z.object({
  /** Unique identifier for the line item. */
  id: z.string().optional(),
  /** Lifecycle status of the item. Follows the parent subscription's status. */
  status: z.string().optional(),
  /** The billed quantity for this item. */
  quantity: z.number().int().optional(),
  /** Whether this item recurs each billing cycle. Always `true` for subscription items. */
  recurring: z.boolean().optional(),
  /**
   * How this line item is priced. `fixed`: a set price per cycle, the same for every customer.
   * `free`: no charge. `custom`: the customer chose the amount at checkout, within the
   * product's bounds.
   */
  price_type: caseInsensitiveEnum(['fixed', 'free', 'custom']).optional(),
  /** Price for one unit of this item, as a decimal string in the item's currency. */
  unit_amount: z.string().optional(),
  /** The currency this item is billed in, as an ISO 4217 code. */
  currency: z.string().optional(),
  /** When this item was last billed, in UTC. `null` if it has not been billed yet. */
  previously_billed_at: z.string().nullable().optional(),
  /** When this item will next be billed, in UTC. */
  next_billed_at: z.string().nullable().optional(),
  price: SubscriptionItemPriceSchema.nullable().optional(),
  product: SubscriptionCatalogProductSchema.nullable().optional(),
  /** When the item was created, in UTC. */
  created_at: z.string().optional(),
  /** When the item was last updated, in UTC. */
  updated_at: z.string().optional(),
})

export type SubscriptionItem = z.infer<typeof SubscriptionItemSchema>

export const CustomerSchema = z.object({
  /** Unique identifier for the customer, prefixed with `cust_`. */
  customer_id: z.string().optional(),
  /** The customer's email address. */
  email: z.string().nullable().optional(),
  /** The customer's full name. `null` when not set. */
  name: z.string().nullable().optional(),
  /** The customer's phone number in E.164 format, e.g. `+2348012345678`. */
  phone_number: z.string().nullable().optional(),
  /** Your own key-value data attached to the customer. */
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** ISO 8601 timestamp when the customer was created. */
  created_at: z.string().nullable().optional(),
  /** ISO 8601 timestamp when the customer was last updated. */
  updated_at: z.string().nullable().optional(),
  /** The customer's billing address, or `null` if none is set. */
  billing_address: CustomerBillingAddressSchema.nullable().optional(),
})

export type Customer = z.infer<typeof CustomerSchema>

export const SubscriptionResponseSchema = z.object({
  /** Unique identifier for the subscription. */
  id: z.string().optional(),
  customer: CustomerSchema.optional(),
  /**
   * The saved payment method billed on each renewal. `null` until a payment method is
   * attached.
   */
  payment_method_id: z.string().nullable().optional(),
  /**
   * Status of the subscription. Set automatically by Bachs as payments succeed or fail.
   * `trialing`: In a free trial. No payment has been collected yet. `trial_end` marks when
   * billing begins. `active`: Active and paid. Bachs is billing this subscription
   * automatically each cycle. `past_due`: A cycle payment failed. Bachs is retrying the
   * payment while access continues. `unpaid`: Payment retries have b...
   */
  status: caseInsensitiveEnum(['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused']).optional(),
  /** How renewals are collected. `charge_automatically` bills the saved card each cycle. */
  collection_method: z.string().optional(),
  /**
   * The currency the subscription is billed in, as an ISO 4217 code. Subscriptions are USD
   * only today.
   */
  currency: z.string().optional(),
  /** Recurring amount as a decimal string */
  amount: z.string().optional(),
  billing_cycle: SubscriptionCadenceSchema.optional(),
  /** Total billable quantity across the subscription's line items. */
  quantity: z.number().int().optional(),
  /** Start of the period currently being billed for, in UTC. */
  current_period_start: z.string().optional(),
  /**
   * End of the period currently being billed for, in UTC. The next charge lands at this time
   * unless the subscription is canceled first.
   */
  current_period_end: z.string().optional(),
  /** Start of the period that was last billed */
  previously_billed_at: z.string().nullable().optional(),
  /** Next scheduled charge date */
  next_billed_at: z.string().nullable().optional(),
  /**
   * When the free trial ends and billing begins, in UTC. `null` if the subscription is not
   * trialing.
   */
  trial_end: z.string().nullable().optional(),
  /**
   * When `true`, the subscription stays active until `current_period_end` and is not renewed.
   * When `false`, it renews normally.
   */
  cancel_at_period_end: z.boolean().optional(),
  /** When the subscription was canceled, in UTC. `null` if it has not been canceled. */
  canceled_at: z.string().nullable().optional(),
  /** When the subscription was created, in UTC. */
  created_at: z.string().optional(),
  product: SubscriptionCatalogProductSchema.nullable().optional(),
  /**
   * The line items that make up the subscription. Each item ties a product and its price to a
   * billed quantity.
   */
  items: z.array(SubscriptionItemSchema).optional(),
  /** Your own key-value data attached to the subscription at creation, returned unchanged. */
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type SubscriptionResponse = z.infer<typeof SubscriptionResponseSchema>

export const SubscriptionPaginationSchema = z.object({
  /** Cursor for the next page, or `null` on the last page. */
  next_cursor: z.string().nullable().optional(),
  /** Cursor for the previous page, or `null` on the first page. */
  prev_cursor: z.string().nullable().optional(),
  /** Whether more results exist after this page. */
  has_more: z.boolean().optional(),
  /** The page size that was applied. */
  limit: z.number().int().optional(),
  /** The offset that was applied. */
  offset: z.number().int().optional(),
  /** The number of items returned on this page. */
  returned: z.number().int().optional(),
  /** Total number of subscriptions matching the query. */
  total: z.number().int().optional(),
})

export type SubscriptionPagination = z.infer<typeof SubscriptionPaginationSchema>

export const SubscriptionListResponseSchema = z.object({
  items: z.array(SubscriptionResponseSchema).optional(),
  pagination: SubscriptionPaginationSchema.optional(),
})

export type SubscriptionListResponse = z.infer<typeof SubscriptionListResponseSchema>

/**
 * A single change to a subscription. Send exactly one intent per request: change the plan
 * (product_id), move a trial (trial_end), change the payment method (payment_method_id), or
 * update metadata (metadata). Combining intents returns 400.
 */
export const UpdateSubscriptionRequestSchema = z.object({
  /**
   * Move the subscription to this product (plan). The price is resolved from the product for
   * the subscription's currency.
   */
  product_id: z.string().optional(),
  /** Future = add/extend the trial; past-or-now = end it and bill now. */
  trial_end: z.string().optional(),
  /**
   * Point the subscription at a different saved card. If past_due/unpaid, retries immediately.
   * Stands alone.
   */
  payment_method_id: z.string().optional(),
  /**
   * Merge key-value metadata into the subscription (up to 20 keys total). Sent keys are added
   * or overwritten; a key sent with an empty-string value is removed; send an empty string
   * (`""`) to clear all metadata. Stands alone: it cannot be combined with a plan, trial, or
   * payment-method change.
   */
  metadata: z.union([z.record(z.string(), z.unknown()), caseInsensitiveEnum([''])]).optional(),
  /** How a plan change is settled. Defaults to invoice_now. See the Proration guide. */
  proration_behavior: caseInsensitiveEnum(['invoice_now', 'next_cycle', 'none']).optional(),
})

export type UpdateSubscriptionRequest = z.infer<typeof UpdateSubscriptionRequestSchema>

export const CancelSubscriptionRequestSchema = z.object({
  /** true = cancel at current_period_end; false = cancel immediately. */
  cancel_at_period_end: z.boolean().optional(),
  /**
   * An optional free-text note recording why the subscription was canceled. Max 255
   * characters.
   */
  reason: z.string().nullable().optional(),
})

export type CancelSubscriptionRequest = z.infer<typeof CancelSubscriptionRequestSchema>

/** Paginated list representation of a payment record. */
export const PaymentListItemResponseSchema = z.object({
  /** Checkout reference for this payment when available. */
  reference: z.string().nullable().optional(),
  /** payment ID for retrieval and reconciliation. */
  id: z.string().nullable().optional(),
  /** Current payment status for this payment. */
  status: z.string(),
  /** Whether this payment is currently eligible for refund operations. */
  is_refundable: z.boolean().nullable().optional(),
  /** Requested payment amount in `currency`. */
  amount: z.string(),
  /** Customer full name from checkout data. May be empty when unavailable. */
  customer_name: z.string(),
  /** Customer email from checkout data. May be empty when unavailable. */
  customer_email: z.string(),
  /** Amount received so far for this payment. */
  amount_paid: z.string().nullable().optional(),
  /** Remaining amount expected before full completion. */
  amount_remaining: z.string().nullable().optional(),
  /** Settlement-side amount captured for this payment. */
  settlement_amount: z.string().nullable().optional(),
  /** Settlement currency code for `settlement_amount`. */
  settlement_currency: z.string().nullable().optional(),
  /** Reserved fee field in list responses. May be null. */
  fee: z.string().nullable().optional(),
  /** Reserved VAT field in list responses. May be null. */
  vat: z.string().nullable().optional(),
  /** Payment currency code. */
  currency: z.string(),
  /** Public metadata attached to the payment when available. */
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  /** ISO 8601 timestamp when the payment was created. */
  transaction_date: z.string().nullable().optional(),
  /** ISO 8601 timestamp when the payment reached a successful terminal state. */
  completed_at: z.string().nullable().optional(),
})

export type PaymentListItemResponse = z.infer<typeof PaymentListItemResponseSchema>

/** Pagination details for a payments list. */
export const PaymentPaginationSchema = z.object({
  /** Cursor for the next page, or `null` on the last page. */
  next_cursor: z.string().nullable().optional(),
  /** Cursor for the previous page, or `null` on the first page. */
  prev_cursor: z.string().nullable().optional(),
  /** Whether more results exist after this page. */
  has_more: z.boolean(),
  /** The page size that was applied. */
  limit: z.number().int(),
  /** The offset that was applied. */
  offset: z.number().int(),
  /** Number of items returned on this page. */
  returned: z.number().int(),
  /** Total number of payments matching the query. */
  total: z.number().int(),
})

export type PaymentPagination = z.infer<typeof PaymentPaginationSchema>

/** A paginated list of payments. */
export const PaymentListResponseSchema = z.object({
  /** Payments for the current page. */
  items: z.array(PaymentListItemResponseSchema),
  pagination: PaymentPaginationSchema,
})

export type PaymentListResponse = z.infer<typeof PaymentListResponseSchema>

/** A webhook endpoint: a URL Bachs delivers events to, and the events it is subscribed to. */
export const WebhookEndpointSchema = z.object({
  /** Unique identifier for the endpoint. */
  endpoint_id: z.string(),
  /** A label for the endpoint. */
  name: z.string(),
  /** The HTTPS URL events are delivered to. */
  url: z.string(),
  /** Whether the endpoint is active and receiving events. */
  enabled: z.boolean(),
  /** The events this endpoint is subscribed to. */
  event_types: z.array(caseInsensitiveEnum(['collection.succeeded', 'collection.failed', 'collection.underpaid', 'checkout.completed', 'checkout.expired', 'payout.created', 'payout.paid', 'payout.failed', 'refund.created', 'refund.paid', 'refund.failed', 'conversion.completed', 'conversion.failed', 'customer.created', 'customer.updated', 'dispute.created', 'dispute.updated', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.created', 'invoice.paid', 'invoice.payment_failed'])),
  /** When the endpoint was created, in UTC. */
  created_at: z.string(),
  /** When the endpoint was last updated, in UTC. */
  updated_at: z.string(),
})

export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>

/** Parameters for creating a webhook endpoint. */
export const CreateWebhookEndpointRequestSchema = z.object({
  /** A label for the endpoint. */
  name: z.string(),
  /** The HTTPS URL Bachs should deliver events to. */
  url: z.string(),
  /** The events to subscribe to. At least one is required. */
  event_types: z.array(caseInsensitiveEnum(['collection.succeeded', 'collection.failed', 'collection.underpaid', 'checkout.completed', 'checkout.expired', 'payout.created', 'payout.paid', 'payout.failed', 'refund.created', 'refund.paid', 'refund.failed', 'conversion.completed', 'conversion.failed', 'customer.created', 'customer.updated', 'dispute.created', 'dispute.updated', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.created', 'invoice.paid', 'invoice.payment_failed'])),
})

export type CreateWebhookEndpointRequest = z.infer<typeof CreateWebhookEndpointRequestSchema>

/** Fields to update on a webhook endpoint. Only the fields you send are changed. */
export const UpdateWebhookEndpointRequestSchema = z.object({
  /** A new label for the endpoint. */
  name: z.string().nullable().optional(),
  /** A new HTTPS delivery URL. */
  url: z.string().nullable().optional(),
  /** Replace the subscribed events. At least one if provided. */
  event_types: z.array(caseInsensitiveEnum(['collection.succeeded', 'collection.failed', 'collection.underpaid', 'checkout.completed', 'checkout.expired', 'payout.created', 'payout.paid', 'payout.failed', 'refund.created', 'refund.paid', 'refund.failed', 'conversion.completed', 'conversion.failed', 'customer.created', 'customer.updated', 'dispute.created', 'dispute.updated', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.created', 'invoice.paid', 'invoice.payment_failed'])).nullable().optional(),
})

export type UpdateWebhookEndpointRequest = z.infer<typeof UpdateWebhookEndpointRequestSchema>

/**
 * The created endpoint, plus its signing secret. The secret is returned only once, on
 * creation. Store it securely.
 */
export const CreateWebhookEndpointResponseSchema = z.object({
  /** Unique identifier for the endpoint. */
  endpoint_id: z.string(),
  /** A label for the endpoint. */
  name: z.string(),
  /** The HTTPS URL events are delivered to. */
  url: z.string(),
  /** Whether the endpoint is active and receiving events. */
  enabled: z.boolean(),
  /** The events this endpoint is subscribed to. */
  event_types: z.array(caseInsensitiveEnum(['collection.succeeded', 'collection.failed', 'collection.underpaid', 'checkout.completed', 'checkout.expired', 'payout.created', 'payout.paid', 'payout.failed', 'refund.created', 'refund.paid', 'refund.failed', 'conversion.completed', 'conversion.failed', 'customer.created', 'customer.updated', 'dispute.created', 'dispute.updated', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.created', 'invoice.paid', 'invoice.payment_failed'])),
  /** When the endpoint was created, in UTC. */
  created_at: z.string(),
  /** When the endpoint was last updated, in UTC. */
  updated_at: z.string(),
  /**
   * The secret used to sign deliveries to this endpoint. Shown only here, on creation. Use it
   * to verify the `X-Bachs-Signature` header.
   */
  signing_secret: z.string(),
})

export type CreateWebhookEndpointResponse = z.infer<typeof CreateWebhookEndpointResponseSchema>

/** An endpoint with its current signing secret. */
export const WebhookEndpointSecretResponseSchema = z.object({
  /** Unique identifier for the endpoint. */
  endpoint_id: z.string(),
  /** A label for the endpoint. */
  name: z.string().optional(),
  /** The HTTPS URL events are delivered to. */
  url: z.string().optional(),
  /** Whether the endpoint is active and receiving events. */
  enabled: z.boolean().optional(),
  /** The events this endpoint is subscribed to. */
  event_types: z.array(caseInsensitiveEnum(['collection.succeeded', 'collection.failed', 'collection.underpaid', 'checkout.completed', 'checkout.expired', 'payout.created', 'payout.paid', 'payout.failed', 'refund.created', 'refund.paid', 'refund.failed', 'conversion.completed', 'conversion.failed', 'customer.created', 'customer.updated', 'dispute.created', 'dispute.updated', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.created', 'invoice.paid', 'invoice.payment_failed'])).optional(),
  /** When the endpoint was created, in UTC. */
  created_at: z.string().optional(),
  /** When the endpoint was last updated, in UTC. */
  updated_at: z.string().optional(),
  /** The endpoint's current signing secret. */
  secret: z.string(),
})

export type WebhookEndpointSecretResponse = z.infer<typeof WebhookEndpointSecretResponseSchema>

/** Delivery counts for one period. */
export const WebhookMetricsDataPointSchema = z.object({
  /** The period, e.g. a date. */
  date: z.string().optional(),
  /** Successful deliveries in this period. */
  success: z.number().int().optional(),
  /** Failed deliveries in this period. */
  failed: z.number().int().optional(),
})

export type WebhookMetricsDataPoint = z.infer<typeof WebhookMetricsDataPointSchema>

/** Delivery metrics for an endpoint over a time range. */
export const WebhookMetricsResponseSchema = z.object({
  /** Total deliveries over the range. */
  total: z.string(),
  /** The grouping period, e.g. `day`. */
  period: z.string(),
  /** One data point per period. */
  data: z.array(WebhookMetricsDataPointSchema),
})

export type WebhookMetricsResponse = z.infer<typeof WebhookMetricsResponseSchema>

/** A summary of a webhook event across all endpoints. */
export const WebhookEventListItemSchema = z.object({
  /** Unique identifier for the event. */
  event_id: z.string(),
  /** The event type. */
  event_type: z.string(),
  /** The kind of resource the event is about. */
  entity_type: z.string().nullable().optional(),
  /** The resource the event is about. */
  entity_id: z.string().nullable().optional(),
  /** When the event occurred, in UTC. */
  created_at: z.string(),
  /** Total delivery attempts across endpoints. */
  attempts: z.number().int(),
  /** Successful deliveries. */
  success: z.number().int(),
  /** Failed deliveries. */
  failed: z.number().int(),
  /** When delivery was last attempted, in UTC. */
  last_attempt_at: z.string().nullable().optional(),
})

export type WebhookEventListItem = z.infer<typeof WebhookEventListItemSchema>

/** A paginated list of webhook events. */
export const WebhookEventsListResponseSchema = z.object({
  items: z.array(WebhookEventListItemSchema),
  /** Total events matching the query. */
  total: z.number().int(),
  /** The page size applied. */
  limit: z.number().int(),
  /** The offset applied. */
  offset: z.number().int(),
})

export type WebhookEventsListResponse = z.infer<typeof WebhookEventsListResponseSchema>

/** A summary of an event's delivery to one endpoint. */
export const WebhookEndpointEventListItemSchema = z.object({
  /** Unique identifier for the event. */
  event_id: z.string(),
  /** The event type. */
  event_type: z.string(),
  /** The resource the event is about. */
  entity_id: z.string().nullable().optional(),
  /** Delivery attempts to this endpoint. */
  attempts: z.number().int(),
  /** Successful deliveries. */
  success: z.number().int(),
  /** Failed deliveries. */
  failed: z.number().int(),
  /** Status of the last attempt. */
  last_attempt_status: z.string().nullable().optional(),
  /** HTTP status your endpoint returned on the last attempt. */
  last_attempt_http_status: z.number().int().nullable().optional(),
  /** When delivery was last attempted, in UTC. */
  last_attempt_at: z.string().nullable().optional(),
})

export type WebhookEndpointEventListItem = z.infer<typeof WebhookEndpointEventListItemSchema>

/** A paginated list of events delivered to an endpoint. */
export const WebhookEndpointEventsListResponseSchema = z.object({
  items: z.array(WebhookEndpointEventListItemSchema),
  /** Total events for this endpoint. */
  total: z.number().int(),
  /** The page size applied. */
  limit: z.number().int(),
  /** The offset applied. */
  offset: z.number().int(),
})

export type WebhookEndpointEventsListResponse = z.infer<typeof WebhookEndpointEventsListResponseSchema>

/** A single delivery attempt for an event. */
export const WebhookEventAttemptSchema = z.object({
  /** Unique identifier for the attempt. */
  attempt_id: z.string(),
  /** The attempt number (1 is the first). */
  attempt_no: z.number().int(),
  /** Outcome of the attempt. */
  status: z.string(),
  /** The URL the attempt was delivered to. */
  callback_url: z.string().nullable().optional(),
  /** HTTP status your endpoint returned. */
  http_status: z.number().int().nullable().optional(),
  /** A short snippet of your endpoint's response body. */
  response_snippet: z.string().nullable().optional(),
  /** The error, if the attempt failed. */
  last_error: z.string().nullable().optional(),
  /** When the attempt started, in UTC. */
  created_at: z.string(),
  /** When the attempt finished, in UTC. */
  updated_at: z.string(),
})

export type WebhookEventAttempt = z.infer<typeof WebhookEventAttemptSchema>

/** A webhook event with its full payload and delivery attempts. */
export const WebhookEventDetailSchema = z.object({
  /** Unique identifier for the event. */
  event_id: z.string(),
  /** The event type. */
  event_type: z.string(),
  /** The kind of resource the event is about. */
  entity_type: z.string().nullable().optional(),
  /** The resource the event is about. */
  entity_id: z.string().nullable().optional(),
  /** When the event occurred, in UTC. */
  created_at: z.string(),
  /** The full event payload that was (or would be) delivered. */
  payload: z.record(z.string(), z.unknown()),
  /** Every delivery attempt for this event. */
  attempts: z.array(WebhookEventAttemptSchema),
})

export type WebhookEventDetail = z.infer<typeof WebhookEventDetailSchema>

/** The result of re-delivering an event. */
export const ResendWebhookEventResponseSchema = z.object({
  /** Outcome of the resend request. */
  status: z.string(),
  /** The new delivery attempt created. */
  attempt_id: z.string(),
})

export type ResendWebhookEventResponse = z.infer<typeof ResendWebhookEventResponseSchema>

/** Confirmation that an endpoint was deleted. */
export const DeleteWebhookEndpointResponseSchema = z.object({
  /** Always `deleted`. */
  status: z.string(),
  /** The deleted endpoint's id. */
  endpoint_id: z.string(),
})

export type DeleteWebhookEndpointResponse = z.infer<typeof DeleteWebhookEndpointResponseSchema>

/*
|--------------------------------------------------------------------------
| Query parameters
|--------------------------------------------------------------------------
*/

/** Query parameters for `GET /v1/payment-methods/rails`. */
export type ListPaymentRailsParams = {
  /** Payment method to get rails for */
  readonly payment_method: 'CARD' | 'CRYPTO' | 'BANK_TRANSFER' | 'MOBILE_MONEY'
  /** Currency code (e.g., 'NGN', 'USD', 'GHS', 'USDT_TRC20') */
  readonly currency: string
  /** Optional ISO country code (e.g., 'NG', 'GH') to filter rails by country */
  readonly country_code?: string
}

/** Query parameters for `GET /v1/payments`. */
export type ListPaymentsParams = {
  /** Page size. Defaults to 50. Maximum is 100. */
  readonly limit?: number
  /** Number of records to skip before returning results. */
  readonly offset?: number
  /** Optional exact status filter for charge records. */
  readonly status_filter?: 'created' | 'processing' | 'succeeded' | 'accepted' | 'failed' | 'expired' | 'cancelled' | 'refunded' | 'partially_refunded' | 'underpaid' | 'overpaid'
}

/** Query parameters for `GET /v1/conversions`. */
export type ListConversionsParams = {
  readonly limit?: number
  readonly offset?: number
  readonly from_currency?: string
  readonly to_currency?: string
  readonly status?: string
  readonly start_date?: string
  readonly end_date?: string
}

/** Query parameters for `GET /v1/payouts/supported-currencies`. */
export type GetSupportedPayoutCurrenciesParams = {
  /** Payout method to resolve currencies for. */
  readonly method: string
}

/** Query parameters for `GET /v1/payouts/banks`. */
export type ListBanksParams = {
  /** ISO country code used for bank list lookup. */
  readonly country_code?: string
}

/** Query parameters for `GET /v1/payouts`. */
export type ListPayoutsParams = {
  /** Number of records to return. */
  readonly limit?: number
  /** Number of records to skip. */
  readonly offset?: number
  /** Optional exact withdrawal status filter. */
  readonly status_filter?: 'requested' | 'pending' | 'processing' | 'approved' | 'rejected' | 'completed' | 'failed'
}

/** Query parameters for `GET /v1/refunds`. */
export type ListRefundsParams = {
  /** Number of refunds to return. Min 1, max 100. Default 50. */
  readonly limit?: number
  /** Number of refunds to skip before returning results. Default 0. */
  readonly offset?: number
  /** Filter by refund status. Accepted values: PROCESSING, SUCCESS, FAILED. */
  readonly status?: 'PROCESSING' | 'SUCCESS' | 'FAILED'
}

/** Query parameters for `GET /v1/disputes`. */
export type ListDisputesParams = {
  /** Number of disputes to return. Minimum 1 and maximum 100. */
  readonly limit?: number
  /** Number of disputes to skip before returning results. */
  readonly offset?: number
  /** Filter disputes by status. */
  readonly status?: 'needs_response' | 'under_review' | 'won' | 'lost' | 'closed'
  /** Return disputes created at or after this timestamp (ISO 8601). */
  readonly from_date?: string
  /** Return disputes created at or before this timestamp (ISO 8601). */
  readonly to_date?: string
}

/** Query parameters for `GET /v1/customers`. */
export type ListCustomersParams = {
  readonly limit?: number
  readonly offset?: number
  /** Search by customer email or name. */
  readonly search?: string
}

/** Query parameters for `GET /v1/products`. */
export type ListProductsParams = {
  readonly limit?: number
  readonly cursor?: string
  /** Include archived products in the results. Defaults to `false`. */
  readonly include_archived?: boolean
}

/** Query parameters for `GET /v1/product-groups`. */
export type ListProductGroupsParams = {
  readonly limit?: number
  readonly cursor?: string
}

/** Query parameters for `GET /v1/product-groups/{group_id}`. */
export type GetProductGroupParams = {
  readonly include_archived?: boolean
}

/** Query parameters for `GET /v1/subscriptions`. */
export type ListSubscriptionsParams = {
  readonly limit?: number
  readonly offset?: number
  /** Only subscriptions for this customer (cust_...). */
  readonly customer_id?: string
  /** Only subscriptions in this status. */
  readonly status?: 'trialing' | 'active' | 'past_due' | 'unpaid' | 'canceled'
}

/** Query parameters for `GET /v1/webhooks/endpoints/{endpoint_id}/metrics`. */
export type GetWebhookEndpointMetricsParams = {
  /** Grouping period, e.g. `day`. */
  readonly period?: string
  /** Start of the range (ISO 8601). */
  readonly date_from?: string
  /** End of the range (ISO 8601). */
  readonly date_to?: string
}

/** Query parameters for `GET /v1/webhooks/endpoints/{endpoint_id}/events`. */
export type ListWebhookEndpointEventsParams = {
  /** Maximum results to return (1–100, default 50). */
  readonly limit?: number
  /** Number of results to skip. */
  readonly offset?: number
}

/** Query parameters for `GET /v1/webhooks/events`. */
export type ListWebhookEventsParams = {
  /** Maximum results to return (1–100, default 50). */
  readonly limit?: number
  /** Number of results to skip. */
  readonly offset?: number
}

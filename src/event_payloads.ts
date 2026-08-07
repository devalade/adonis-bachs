import { z } from 'zod'

// The customer's billing address: `line1`, `line2`, `city`, `state`,
// `postal_code`, and `country` (ISO-3166-1 alpha-2).
const billingAddressSchema = z.object({
  /** The first line of the street address. */
  line1: z.string().optional(),
  /** The second line of the street address. */
  line2: z.string().nullable().optional(),
  /** The address city. */
  city: z.string().optional(),
  /** The address state or province. */
  state: z.string().optional(),
  /** The postal code. */
  postal_code: z.string().optional(),
  /** The ISO-3166-1 alpha-2 country code. */
  country: z.string().optional()
})

// The full customer object: `customer_id`, `email`, `name`, `phone_number`,
// `metadata`, `billing_address`, `created_at`, and `updated_at`.
const customerSchema = z.object({
  /** The customer's ID, prefixed `cust_`. */
  customer_id: z.string(),
  /** The customer's email address. */
  email: z.string().optional(),
  /** The customer's name. */
  name: z.string().nullable().optional(),
  /** The customer's phone number in E.164 format. */
  phone_number: z.string().nullable().optional(),
  /** Your own key-value data on the customer. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** The customer's billing address, or `null` when no address is stored. */
  billing_address: billingAddressSchema.nullable().optional(),
  /** When the customer was created, in UTC. */
  created_at: z.string().optional(),
  /** When the customer was last updated, in UTC. */
  updated_at: z.string().optional()
})

// `{ subscription_id }` identifying the subscription an event refers to.
const subscriptionRefSchema = z.object({
  /** The subscription's ID. */
  subscription_id: z.string()
})

/**
 * checkout.completed: Occurs when a customer finishes a checkout session,
 * whether or not a payment was collected.
 */
export const CheckoutCompletedDataSchema = z.object({
  /** The checkout session that completed. */
  checkout_id: z.string(),
  /** Always `completed`. */
  status: z.string(),
  /** The checkout's mode: `payment`, `setup`, or `subscription`. */
  mode: z.string().optional(),
  /**
   * Whether a payment was collected at checkout. `paid` when a charge was made,
   * `no_payment_required` when nothing was due.
   */
  payment_status: z.string().optional(),
  /** The checkout amount, as a decimal string. `"0"` for a free checkout. */
  amount: z.string(),
  /** The checkout currency code. */
  currency: z.string().nullable(),
  /** Checkout reference you supplied, when available. */
  reference: z.string().nullable().optional(),
  /** The customer who completed the checkout, or `null` if none was attached. */
  customer: customerSchema.nullable().optional(),
  /**
   * The resulting charge, in the same shape as `GET /v1/payments/charges/{charge_id}`.
   * `null` for a free checkout, since no charge is created when nothing is collected.
   */
  charge: z
    .object({
      /** The charge's ID. */
      id: z.string().optional(),
      /** Your organization's ID. */
      organization_id: z.string(),
      /** The customer the charge was collected from. */
      customer_id: z.string(),
      /** The charge amount, as a decimal string. */
      amount: z.string(),
      /** The charge currency code. */
      currency: z.string(),
      /** The currency used for settlement credit. */
      settlement_currency: z.string().optional(),
      /** The amount credited in `settlement_currency`, as a decimal string. */
      settlement_amount: z.string().optional(),
      /** The charge status. */
      status: z.string(),
      /** Public metadata stored with the charge. */
      metadata: z.record(z.string(), z.unknown()).nullable().optional(),
      /** When the charge was created, in UTC. */
      created_at: z.string().optional(),
      /** When the charge was last updated, in UTC. */
      updated_at: z.string().optional()
    })
    .nullable()
    .optional(),
  /** `{ subscription_id }` for a `subscription`-mode checkout, else `null`. */
  subscription: subscriptionRefSchema.nullable().optional(),
  /** Where the customer was redirected after completing. */
  success_url: z.string().nullable().optional(),
  /** Where the customer would have been redirected had they canceled. */
  cancel_url: z.string().nullable().optional(),
  /** Public metadata stored on the checkout. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** When the checkout completed, in UTC. */
  completed_at: z.string().optional(),
  /** The checkout's original expiry time, in UTC. */
  expires_at: z.string().nullable().optional(),
  /** When the checkout session was created, in UTC. */
  created_at: z.string().optional()
})

/**
 * checkout.expired: Occurs when an open checkout session lapses past its
 * expiry without the customer completing it.
 */
export const CheckoutExpiredDataSchema = z.object({
  /** The checkout session that expired. */
  checkout_id: z.string(),
  /** Always `expired`. */
  status: z.string(),
  /** The checkout's mode: `payment`, `setup`, or `subscription`. */
  mode: z.string().optional(),
  /** Always `null`. An expired checkout never collected payment. */
  payment_status: z.null().optional(),
  /** The amount the checkout would have collected, as a decimal string. */
  amount: z.string(),
  /** The checkout currency code. */
  currency: z.string().nullable(),
  /** Checkout reference you supplied, when available. */
  reference: z.string().nullable().optional(),
  /** The customer attached to the checkout, or `null` if none was attached. */
  customer: customerSchema.nullable().optional(),
  /** Always `null`. An expired checkout has no charge. */
  charge: z.null().optional(),
  /** Always `null`. An expired checkout never started a subscription. */
  subscription: z.null().optional(),
  /** Where the customer would have been redirected on success. */
  success_url: z.string().nullable().optional(),
  /** Where the customer would have been redirected had they canceled. */
  cancel_url: z.string().nullable().optional(),
  /** Public metadata stored on the checkout. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Always `null`. The checkout was never completed. */
  completed_at: z.null().optional(),
  /** When the checkout's expiry lapsed, in UTC. */
  expires_at: z.string().optional(),
  /** When the checkout session was created, in UTC. */
  created_at: z.string().optional()
})

/**
 * collection.succeeded: Occurs when a payment is successfully collected from
 * a customer.
 */
export const CollectionSucceededDataSchema = z.object({
  /** Charge ID for reconciliation and retrieval calls. May be `null`. */
  charge_id: z.string().nullable().optional(),
  /** Checkout that originated the charge, when applicable. */
  checkout_id: z.string().nullable().optional(),
  /** Checkout reference you supplied, when available. */
  reference: z.string().nullable().optional(),
  /** Successful charge state. Typical values: `SUCCEEDED`, `ACCEPTED`, `OVERPAID`. */
  status: z.string(),
  /** Original charged amount in `data.currency`. */
  amount: z.string(),
  /** Customer payment currency code. */
  currency: z.string(),
  /** Amount credited in `data.settlement_currency`. */
  settlement_amount: z.string().optional(),
  /** Currency used for settlement credit. */
  settlement_currency: z.string().optional(),
  /** Payment method used to process this charge, e.g. `BANK_TRANSFER`, `CARD`, `MOBILE_MONEY`. */
  payment_method: z.string().optional(),
  /**
   * Platform processing fee in `data.processing_fee_currency`. Null when the
   * final settlement value has not yet been determined (deferred settlement).
   */
  processing_fee: z.string().nullable().optional(),
  /** Currency of `data.processing_fee`, typically the settlement currency. Null when `processing_fee` is null. */
  processing_fee_currency: z.string().nullable().optional(),
  /**
   * Who absorbed the processing fee. Either `customer` (fee added on top of
   * the charge amount) or `merchant` (fee deducted from settlement).
   */
  fee_bearer: z.string().optional(),
  /**
   * Products purchased in a one-time checkout session. Each item contains
   * `product_id`, `quantity`, and `amount` (present only for custom-priced products).
   */
  product_cart: z
    .array(
      z.object({
        /** The product's ID. */
        product_id: z.string(),
        /** The quantity purchased. */
        quantity: z.number().optional(),
        /** The unit amount, as a decimal string, for custom-priced products. */
        amount: z.string().optional()
      })
    )
    .nullable()
    .optional(),
  /** The customer who made the payment, with `id`, `email`, and `name`. */
  customer: z
    .object({
      /** The customer's ID. */
      id: z.string().optional(),
      /** The customer's email address. */
      email: z.string().optional(),
      /** The customer's name. */
      name: z.string().nullable().optional()
    })
    .optional(),
  /** Public metadata stored with the charge. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * collection.failed: Occurs when a payment attempt fails and reaches a failed
 * terminal state.
 */
export const CollectionFailedDataSchema = z.object({
  /** Charge ID for support and reconciliation workflows. */
  charge_id: z.string(),
  /** Checkout that originated the charge, when available. */
  checkout_id: z.string().nullable().optional(),
  /** Checkout reference, when available. */
  reference: z.string().nullable().optional(),
  /** Failed terminal state, typically `FAILED` or `EXPIRED`. */
  status: z.string(),
  /** Original charge amount in `data.currency`. */
  amount: z.string(),
  /** Customer payment currency code. */
  currency: z.string(),
  /** Settlement amount, `0.00` for a failed charge. */
  settlement_amount: z.string().optional(),
  /** Settlement currency. */
  settlement_currency: z.string().optional(),
  /** Payment method attempted. */
  payment_method: z.string().optional(),
  /** Platform processing fee, null for a failed charge. */
  processing_fee: z.string().nullable().optional(),
  /** Currency of `data.processing_fee`. */
  processing_fee_currency: z.string().nullable().optional(),
  /** Who absorbed the processing fee, `customer` or `merchant`. */
  fee_bearer: z.string().optional(),
  /** Products purchased in the checkout session. */
  product_cart: z
    .array(
      z.object({
        /** The product's ID. */
        product_id: z.string(),
        /** The quantity purchased. */
        quantity: z.number().optional(),
        /** The unit amount, as a decimal string. */
        amount: z.string().optional()
      })
    )
    .nullable()
    .optional(),
  /** The customer, with `id`, `email`, and `name`. */
  customer: z
    .object({
      /** The customer's ID. */
      id: z.string().optional(),
      /** The customer's email address. */
      email: z.string().optional(),
      /** The customer's name. */
      name: z.string().nullable().optional()
    })
    .optional(),
  /** A human-readable reason for the failure, when available. */
  reason: z.string().nullable().optional(),
  /** Public metadata stored with the charge. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * collection.underpaid: Occurs when a customer pays less than the amount due.
 */
export const CollectionUnderpaidDataSchema = z.object({
  /** The underpaid charge's ID. */
  charge_id: z.string(),
  /** Checkout reference, when available. */
  reference: z.string().nullable().optional(),
  /** The checkout that originated the charge. */
  checkout_id: z.string().nullable().optional(),
  /** Amount the customer actually paid, in `data.currency`. */
  amount_paid: z.string().optional(),
  /** Amount that was due. */
  amount_expected: z.string().optional(),
  /** The shortfall: `amount_expected` minus `amount_paid`. */
  amount_remaining: z.string().optional(),
  /** Customer payment currency code. */
  currency: z.string(),
  /** Always `UNDERPAID`. */
  status: z.string(),
  /** The payment provider's reference for the transaction. */
  provider_reference: z.string().nullable().optional(),
  /** Public metadata stored with the charge. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * customer.created: Occurs when a new customer is created.
 */
export const CustomerCreatedDataSchema = z.object({
  /** The customer's ID, prefixed `cust_`. */
  customer_id: z.string(),
  /** The customer's email address. */
  email: z.string().optional(),
  /** The customer's name. */
  name: z.string().nullable().optional(),
  /** The customer's phone number in E.164 format. */
  phone_number: z.string().nullable().optional(),
  /** Your own key-value data on the customer. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** The customer's billing address, or `null` when no address is stored. */
  billing_address: billingAddressSchema.nullable().optional(),
  /** When the customer was created, in UTC. */
  created_at: z.string().optional(),
  /** When the customer was last updated, in UTC. */
  updated_at: z.string().optional()
})

/**
 * customer.updated: Occurs when a customer's details change.
 */
export const CustomerUpdatedDataSchema = z.object({
  /** The customer's ID, prefixed `cust_`. */
  customer_id: z.string(),
  /** The customer's email address. */
  email: z.string().optional(),
  /** The customer's name. */
  name: z.string().nullable().optional(),
  /** The customer's phone number in E.164 format. */
  phone_number: z.string().nullable().optional(),
  /** Your own key-value data on the customer. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /** The customer's billing address, or `null` when no address is stored. */
  billing_address: billingAddressSchema.nullable().optional(),
  /** When the customer was created, in UTC. */
  created_at: z.string().optional(),
  /** When the customer was last updated, in UTC. */
  updated_at: z.string().optional()
})

/**
 * customer.subscription.created: Occurs when a subscription is created after
 * a customer completes a recurring checkout.
 */
export const CustomerSubscriptionCreatedDataSchema = z.object({
  /** The subscription's ID. */
  subscription_id: z.string(),
  /** The full customer object attached to the subscription. */
  customer: customerSchema.optional(),
  /** The product the subscription bills. */
  product_id: z.string(),
  /** Subscription status: `trialing`, `active`, `past_due`, `unpaid`, `canceled`, or `paused`. */
  status: z.string(),
  /** How renewals are collected, e.g. `charge_automatically`. */
  collection_method: z.string().optional(),
  /** The billing currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The recurring amount, as a decimal string. */
  amount: z.string(),
  /** The cadence: `{ interval, frequency }`. */
  billing_cycle: z
    .object({
      /** The billing interval, e.g. `month`. */
      interval: z.string().optional(),
      /** How many intervals make up a billing period. */
      frequency: z.number().optional()
    })
    .optional(),
  /** The quantity of the product being billed. */
  quantity: z.number().optional(),
  /** Start of the current billing period, in UTC. */
  current_period_start: z.string().optional(),
  /** End of the current billing period, in UTC. */
  current_period_end: z.string().optional(),
  /** When the subscription next renews, in UTC. */
  next_billed_at: z.string().nullable().optional(),
  /** When the trial ends, or `null` if not trialing. */
  trial_end: z.string().nullable().optional(),
  /** Whether the subscription is set to end at the period end. */
  cancel_at_period_end: z.boolean().optional(),
  /** When the subscription was canceled, or `null`. */
  canceled_at: z.string().nullable().optional(),
  /** When the subscription was created, in UTC. */
  created_at: z.string().optional(),
  /** The line items being billed. */
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Your own key-value data on the subscription. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * customer.subscription.updated: Occurs when a subscription changes: a plan
 * change, trial move, payment-method swap, or status transition.
 */
export const CustomerSubscriptionUpdatedDataSchema = z.object({
  /** The subscription's ID. */
  subscription_id: z.string(),
  /** The full customer object attached to the subscription. */
  customer: customerSchema.optional(),
  /** The product the subscription bills. */
  product_id: z.string(),
  /** Subscription status: `trialing`, `active`, `past_due`, `unpaid`, `canceled`, or `paused`. */
  status: z.string(),
  /** How renewals are collected, e.g. `charge_automatically`. */
  collection_method: z.string().optional(),
  /** The billing currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The recurring amount, as a decimal string. */
  amount: z.string(),
  /** The cadence: `{ interval, frequency }`. */
  billing_cycle: z
    .object({
      /** The billing interval, e.g. `month`. */
      interval: z.string().optional(),
      /** How many intervals make up a billing period. */
      frequency: z.number().optional()
    })
    .optional(),
  /** The quantity of the product being billed. */
  quantity: z.number().optional(),
  /** Start of the current billing period, in UTC. */
  current_period_start: z.string().optional(),
  /** End of the current billing period, in UTC. */
  current_period_end: z.string().optional(),
  /** When the subscription next renews, in UTC. */
  next_billed_at: z.string().nullable().optional(),
  /** When the trial ends, or `null` if not trialing. */
  trial_end: z.string().nullable().optional(),
  /** Whether the subscription is set to end at the period end. */
  cancel_at_period_end: z.boolean().optional(),
  /** When the subscription was canceled, or `null`. */
  canceled_at: z.string().nullable().optional(),
  /** When the subscription was created, in UTC. */
  created_at: z.string().optional(),
  /** The line items being billed. */
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Your own key-value data on the subscription. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * customer.subscription.deleted: Occurs when a subscription is canceled and
 * will no longer renew.
 */
export const CustomerSubscriptionDeletedDataSchema = z.object({
  /** The subscription's ID. */
  subscription_id: z.string(),
  /** The full customer object attached to the subscription. */
  customer: customerSchema.optional(),
  /** The product the subscription bills. */
  product_id: z.string(),
  /** Subscription status: `trialing`, `active`, `past_due`, `unpaid`, `canceled`, or `paused`. */
  status: z.string(),
  /** How renewals are collected, e.g. `charge_automatically`. */
  collection_method: z.string().optional(),
  /** The billing currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The recurring amount, as a decimal string. */
  amount: z.string(),
  /** The cadence: `{ interval, frequency }`. */
  billing_cycle: z
    .object({
      /** The billing interval, e.g. `month`. */
      interval: z.string().optional(),
      /** How many intervals make up a billing period. */
      frequency: z.number().optional()
    })
    .optional(),
  /** The quantity of the product being billed. */
  quantity: z.number().optional(),
  /** Start of the current billing period, in UTC. */
  current_period_start: z.string().optional(),
  /** End of the current billing period, in UTC. */
  current_period_end: z.string().optional(),
  /** When the subscription next renews, in UTC. */
  next_billed_at: z.string().nullable().optional(),
  /** When the trial ends, or `null` if not trialing. */
  trial_end: z.string().nullable().optional(),
  /** Whether the subscription is set to end at the period end. */
  cancel_at_period_end: z.boolean().optional(),
  /** When the subscription was canceled, or `null`. */
  canceled_at: z.string().nullable().optional(),
  /** When the subscription was created, in UTC. */
  created_at: z.string().optional(),
  /** The line items being billed. */
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Your own key-value data on the subscription. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * invoice.created: Occurs when an invoice is created for a subscription cycle
 * or a one-off charge.
 */
export const InvoiceCreatedDataSchema = z.object({
  /** The invoice's ID. */
  invoice_id: z.string(),
  /** The subscription this invoice belongs to, or `null` for a one-off. */
  subscription: subscriptionRefSchema.nullable().optional(),
  /** The customer the invoice is for. */
  customer: z
    .object({
      /** The customer's ID, prefixed `cust_`. */
      customer_id: z.string(),
      /** The customer's email address. */
      email: z.string().optional(),
      /** The customer's name. */
      name: z.string().nullable().optional()
    })
    .optional(),
  /** The payment that collected the invoice, once collection is attempted. */
  charge: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Invoice status: `draft`, `open`, `paid`, `uncollectible`, or `void`. */
  status: z.string(),
  /** How the invoice is collected, e.g. `charge_automatically`. */
  collection_method: z.string().optional(),
  /** The invoice currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The subtotal before credits, as a decimal string. */
  subtotal: z.string().optional(),
  /** The total due, as a decimal string. */
  total: z.string().optional(),
  /** Amount paid so far. */
  amount_paid: z.string().optional(),
  /** Amount still due. */
  amount_remaining: z.string().optional(),
  /** Start of the billing period, in UTC. */
  period_start: z.string().optional(),
  /** End of the billing period, in UTC. */
  period_end: z.string().optional(),
  /** Number of collection attempts made. */
  attempt_count: z.number().optional(),
  /** When the next collection attempt is scheduled. */
  next_payment_attempt: z.string().nullable().optional(),
  /** When the invoice was created, in UTC. */
  created_at: z.string().optional(),
  /** Your own key-value data on the invoice. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * invoice.paid: Occurs when an invoice is paid in full.
 */
export const InvoicePaidDataSchema = z.object({
  /** The invoice's ID. */
  invoice_id: z.string(),
  /** The subscription this invoice belongs to, or `null` for a one-off. */
  subscription: subscriptionRefSchema.nullable().optional(),
  /** The customer the invoice is for. */
  customer: z
    .object({
      /** The customer's ID, prefixed `cust_`. */
      customer_id: z.string(),
      /** The customer's email address. */
      email: z.string().optional(),
      /** The customer's name. */
      name: z.string().nullable().optional()
    })
    .optional(),
  /** The payment that collected the invoice, once collection is attempted. */
  charge: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Invoice status: `draft`, `open`, `paid`, `uncollectible`, or `void`. */
  status: z.string(),
  /** How the invoice is collected, e.g. `charge_automatically`. */
  collection_method: z.string().optional(),
  /** The invoice currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The subtotal before credits, as a decimal string. */
  subtotal: z.string().optional(),
  /** The total due, as a decimal string. */
  total: z.string().optional(),
  /** Amount paid so far. */
  amount_paid: z.string().optional(),
  /** Amount still due. */
  amount_remaining: z.string().optional(),
  /** Start of the billing period, in UTC. */
  period_start: z.string().optional(),
  /** End of the billing period, in UTC. */
  period_end: z.string().optional(),
  /** Number of collection attempts made. */
  attempt_count: z.number().optional(),
  /** When the next collection attempt is scheduled. */
  next_payment_attempt: z.string().nullable().optional(),
  /** When the invoice was created, in UTC. */
  created_at: z.string().optional(),
  /** Your own key-value data on the invoice. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * invoice.payment_failed: Occurs when an attempt to collect an invoice fails.
 */
export const InvoicePaymentFailedDataSchema = z.object({
  /** The invoice's ID. */
  invoice_id: z.string(),
  /** The subscription this invoice belongs to, or `null` for a one-off. */
  subscription: subscriptionRefSchema.nullable().optional(),
  /** The customer the invoice is for. */
  customer: z
    .object({
      /** The customer's ID, prefixed `cust_`. */
      customer_id: z.string(),
      /** The customer's email address. */
      email: z.string().optional(),
      /** The customer's name. */
      name: z.string().nullable().optional()
    })
    .optional(),
  /** The payment that collected the invoice, once collection is attempted. */
  charge: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Invoice status: `draft`, `open`, `paid`, `uncollectible`, or `void`. */
  status: z.string(),
  /** How the invoice is collected, e.g. `charge_automatically`. */
  collection_method: z.string().optional(),
  /** The invoice currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The subtotal before credits, as a decimal string. */
  subtotal: z.string().optional(),
  /** The total due, as a decimal string. */
  total: z.string().optional(),
  /** Amount paid so far. */
  amount_paid: z.string().optional(),
  /** Amount still due. */
  amount_remaining: z.string().optional(),
  /** Start of the billing period, in UTC. */
  period_start: z.string().optional(),
  /** End of the billing period, in UTC. */
  period_end: z.string().optional(),
  /** Number of collection attempts made. */
  attempt_count: z.number().optional(),
  /** When the next collection attempt is scheduled. */
  next_payment_attempt: z.string().nullable().optional(),
  /** When the invoice was created, in UTC. */
  created_at: z.string().optional(),
  /** Your own key-value data on the invoice. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

/**
 * payout.created: Occurs when a payout (withdrawal) is created and begins
 * processing.
 */
export const PayoutCreatedDataSchema = z.object({
  /** The payout's ID. */
  withdrawal_id: z.string(),
  /** Your reference for the payout, or the one Bachs generated. */
  reference: z.string().nullable().optional(),
  /** The payout provider's reference. */
  provider_reference: z.string().nullable().optional(),
  /** Payout status, e.g. `PENDING`, `PAID`, `FAILED`. */
  status: z.string(),
  /** The payout amount in `data.currency`. */
  amount: z.string(),
  /** The source currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The currency debited from your balance. */
  from_currency: z.string().nullable().optional(),
  /** The currency delivered to the destination. */
  to_currency: z.string().nullable().optional(),
  /** The FX rate applied, when a conversion occurred. */
  exchange_rate: z.string().nullable().optional(),
  /** The amount delivered in `data.to_currency`. */
  to_amount: z.string().nullable().optional(),
  /** The payout fee, when applicable. */
  withdrawal_fee: z.string().nullable().optional(),
  /** The net amount debited after fees. */
  net_from_amount: z.string().nullable().optional()
})

/**
 * payout.paid: Occurs when a payout is delivered to its destination.
 */
export const PayoutPaidDataSchema = z.object({
  /** The payout's ID. */
  withdrawal_id: z.string(),
  /** Your reference for the payout, or the one Bachs generated. */
  reference: z.string().nullable().optional(),
  /** The payout provider's reference. */
  provider_reference: z.string().nullable().optional(),
  /** Payout status, e.g. `PENDING`, `PAID`, `FAILED`. */
  status: z.string(),
  /** The payout amount in `data.currency`. */
  amount: z.string(),
  /** The source currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The currency debited from your balance. */
  from_currency: z.string().nullable().optional(),
  /** The currency delivered to the destination. */
  to_currency: z.string().nullable().optional(),
  /** The FX rate applied, when a conversion occurred. */
  exchange_rate: z.string().nullable().optional(),
  /** The amount delivered in `data.to_currency`. */
  to_amount: z.string().nullable().optional(),
  /** The payout fee, when applicable. */
  withdrawal_fee: z.string().nullable().optional(),
  /** The net amount debited after fees. */
  net_from_amount: z.string().nullable().optional()
})

/**
 * payout.failed: Occurs when a payout fails to be delivered.
 */
export const PayoutFailedDataSchema = z.object({
  /** The payout's ID. */
  withdrawal_id: z.string(),
  /** Your reference for the payout, or the one Bachs generated. */
  reference: z.string().nullable().optional(),
  /** The payout provider's reference. */
  provider_reference: z.string().nullable().optional(),
  /** Payout status, e.g. `PENDING`, `PAID`, `FAILED`. */
  status: z.string(),
  /** The payout amount in `data.currency`. */
  amount: z.string(),
  /** The source currency, as an ISO 4217 code. */
  currency: z.string(),
  /** The currency debited from your balance. */
  from_currency: z.string().nullable().optional(),
  /** The currency delivered to the destination. */
  to_currency: z.string().nullable().optional(),
  /** The FX rate applied, when a conversion occurred. */
  exchange_rate: z.string().nullable().optional(),
  /** The amount delivered in `data.to_currency`. */
  to_amount: z.string().nullable().optional(),
  /** The payout fee, when applicable. */
  withdrawal_fee: z.string().nullable().optional(),
  /** The net amount debited after fees. */
  net_from_amount: z.string().nullable().optional()
})

/**
 * refund.created: Occurs when a refund is created and begins processing.
 */
export const RefundCreatedDataSchema = z.object({
  /** The refund's ID. */
  refund_id: z.string(),
  /** The charge being refunded. */
  charge_id: z.string(),
  /** Your reference for the refund, or the one Bachs generated. */
  reference: z.string().nullable().optional(),
  /** Refund status, e.g. `processing`, `paid`, `failed`. */
  status: z.string(),
  /** The amount requested to refund, as a decimal string. */
  requested_amount: z.string().optional(),
  /** The amount actually refunded so far. */
  refunded_amount: z.string().nullable().optional(),
  /** The fee charged on the refund, if any. */
  refund_fee_amount: z.string().optional(),
  /** Who absorbs the refund fee, `customer` or `merchant`. */
  fee_bearer: z.string().optional(),
  /** The reason for the refund, when provided. */
  reason: z.string().nullable().optional()
})

/**
 * refund.paid: Occurs when a refund is successfully delivered to the customer.
 */
export const RefundPaidDataSchema = z.object({
  /** The refund's ID. */
  refund_id: z.string(),
  /** The charge being refunded. */
  charge_id: z.string(),
  /** Your reference for the refund, or the one Bachs generated. */
  reference: z.string().nullable().optional(),
  /** Refund status, e.g. `processing`, `paid`, `failed`. */
  status: z.string(),
  /** The amount requested to refund, as a decimal string. */
  requested_amount: z.string().optional(),
  /** The amount actually refunded so far. */
  refunded_amount: z.string().nullable().optional(),
  /** The fee charged on the refund, if any. */
  refund_fee_amount: z.string().optional(),
  /** Who absorbs the refund fee, `customer` or `merchant`. */
  fee_bearer: z.string().optional(),
  /** The reason for the refund, when provided. */
  reason: z.string().nullable().optional()
})

/**
 * refund.failed: Occurs when a refund fails to be delivered.
 */
export const RefundFailedDataSchema = z.object({
  /** The refund's ID. */
  refund_id: z.string(),
  /** The charge being refunded. */
  charge_id: z.string(),
  /** Your reference for the refund, or the one Bachs generated. */
  reference: z.string().nullable().optional(),
  /** Refund status, e.g. `processing`, `paid`, `failed`. */
  status: z.string(),
  /** The amount requested to refund, as a decimal string. */
  requested_amount: z.string().optional(),
  /** The amount actually refunded so far. */
  refunded_amount: z.string().nullable().optional(),
  /** The fee charged on the refund, if any. */
  refund_fee_amount: z.string().optional(),
  /** Who absorbs the refund fee, `customer` or `merchant`. */
  fee_bearer: z.string().optional(),
  /** The reason for the refund, when provided. */
  reason: z.string().nullable().optional()
})

/**
 * dispute.created: Occurs when a customer's bank raises a dispute (chargeback)
 * against a charge.
 */
export const DisputeCreatedDataSchema = z.object({
  /** The dispute's ID. */
  dispute_id: z.string(),
  /** The disputed charge. */
  charge_id: z.string(),
  /** The disputed amount, as a decimal string. */
  amount: z.string(),
  /** The dispute currency, as an ISO 4217 code. */
  currency: z.string(),
  /** Dispute status, e.g. `needs_response`, `under_review`, `won`, `lost`. */
  status: z.string(),
  /** Whether you can still submit or update evidence. */
  is_response_editable: z.boolean().optional(),
  /** The reason the dispute was raised. */
  reason: z.string().nullable().optional(),
  /** When your evidence is due, in UTC. */
  response_deadline_at: z.string().nullable().optional(),
  /** When the dispute was created, in UTC. */
  created_at: z.string().optional(),
  /** When the dispute was last updated, in UTC. */
  updated_at: z.string().optional()
})

/**
 * dispute.updated: Occurs when a dispute changes status or evidence is updated.
 */
export const DisputeUpdatedDataSchema = z.object({
  /** The dispute's ID. */
  dispute_id: z.string(),
  /** The disputed charge. */
  charge_id: z.string(),
  /** The disputed amount, as a decimal string. */
  amount: z.string(),
  /** The dispute currency, as an ISO 4217 code. */
  currency: z.string(),
  /** Dispute status, e.g. `needs_response`, `under_review`, `won`, `lost`. */
  status: z.string(),
  /** Whether you can still submit or update evidence. */
  is_response_editable: z.boolean().optional(),
  /** The reason the dispute was raised. */
  reason: z.string().nullable().optional(),
  /** When your evidence is due, in UTC. */
  response_deadline_at: z.string().nullable().optional(),
  /** When the dispute was created, in UTC. */
  created_at: z.string().optional(),
  /** When the dispute was last updated, in UTC. */
  updated_at: z.string().optional()
})

/**
 * conversion.completed: Occurs when a currency conversion completes
 * successfully.
 */
export const ConversionCompletedDataSchema = z.object({
  /** The conversion's ID. */
  conversion_id: z.string(),
  /** The quote the conversion was executed against. */
  quote_id: z.string(),
  /** The source currency, as an ISO 4217 code. */
  from_currency: z.string().optional(),
  /** The target currency, as an ISO 4217 code. */
  to_currency: z.string().optional(),
  /** The amount converted from, as a decimal string. */
  from_amount: z.string().optional(),
  /** The amount received in the target currency. */
  to_amount: z.string().optional(),
  /** The FX rate applied. */
  exchange_rate: z.string().optional(),
  /** Conversion status, e.g. `completed`, `failed`. */
  status: z.string(),
  /** When the conversion was created, in UTC. */
  created_at: z.string().optional()
})

/**
 * conversion.failed: Occurs when a currency conversion fails.
 */
export const ConversionFailedDataSchema = z.object({
  /** The conversion's ID. */
  conversion_id: z.string(),
  /** The quote the conversion was executed against. */
  quote_id: z.string(),
  /** The source currency, as an ISO 4217 code. */
  from_currency: z.string().optional(),
  /** The target currency, as an ISO 4217 code. */
  to_currency: z.string().optional(),
  /** The amount converted from, as a decimal string. */
  from_amount: z.string().optional(),
  /** The amount received in the target currency. */
  to_amount: z.string().optional(),
  /** The FX rate applied. */
  exchange_rate: z.string().optional(),
  /** Conversion status, e.g. `completed`, `failed`. */
  status: z.string(),
  /** When the conversion was created, in UTC. */
  created_at: z.string().optional()
})

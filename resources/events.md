# checkout.completed
Source: https://docs.bachs.io/guides/webhooks/events/checkout-completed

Occurs when a customer finishes a checkout session, whether or not a payment was collected.

Sent when a checkout session finishes successfully: payment, setup, and subscription checkouts all fire it. Use it as the single "the customer is done" signal, then check `data.payment_status` to see whether a payment was actually collected.

<Note>
  A free checkout (a `$0` cart, or a `setup`-mode checkout that only saves a payment method) also fires `checkout.completed`, with `data.payment_status` set to `no_payment_required`. No charge is created and no `collection.succeeded` event is sent for it — `checkout.completed` is the only signal you'll get.
</Note>

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_7f6e5d4c3b2a1908",
    "type": "checkout.completed",
    "created_at": "2026-07-20T09:15:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "checkout_id": "chk_9x8y7z6w5v",
      "status": "completed",
      "mode": "payment",
      "payment_status": "paid",
      "amount": "19.00",
      "currency": "USD",
      "reference": "pay_abc123def456",
      "customer": {
        "customer_id": "cust_1a2b3c4d5e6f",
        "email": "jane@example.com",
        "name": "Jane Doe",
        "phone_number": null,
        "metadata": {},
        "billing_address": {
          "line1": "40 Yaba Road",
          "line2": null,
          "city": "Lagos",
          "state": "Lagos",
          "postal_code": "101245",
          "country": "NG"
        },
        "created_at": "2026-06-01T12:00:00Z",
        "updated_at": "2026-06-01T12:00:00Z"
      },
      "charge": {
        "id": "chr_1a2b3c4d5e6f",
        "organization_id": "org_abc123",
        "customer_id": "cust_1a2b3c4d5e6f",
        "amount": "19.00",
        "currency": "USD",
        "settlement_currency": "USD",
        "settlement_amount": "18.62",
        "status": "SUCCEEDED",
        "metadata": {},
        "created_at": "2026-07-20T09:14:40Z",
        "updated_at": "2026-07-20T09:15:00Z"
      },
      "subscription": null,
      "success_url": "https://example.com/success",
      "cancel_url": "https://example.com/cancel",
      "metadata": {
        "order_id": "ORD-12345"
      },
      "completed_at": "2026-07-20T09:15:00.000000+00:00",
      "expires_at": "2026-07-20T10:14:00.000000+00:00",
      "created_at": "2026-07-20T09:14:00.000000+00:00"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `checkout.completed`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.checkout_id" type="string">The checkout session that completed.</ResponseField>
<ResponseField name="data.status" type="string">Always `completed`.</ResponseField>
<ResponseField name="data.mode" type="string">The checkout's mode: `payment`, `setup`, or `subscription`.</ResponseField>
<ResponseField name="data.payment_status" type="string">Whether a payment was collected at checkout. `paid` when a charge was made, `no_payment_required` when nothing was due — a free (\$0) checkout, a `setup`-mode checkout, or a subscription on a free trial (billed at trial end).</ResponseField>
<ResponseField name="data.amount" type="string">The checkout amount, as a decimal string. `"0"` for a free checkout.</ResponseField>
<ResponseField name="data.currency" type="string | null">The checkout currency code.</ResponseField>
<ResponseField name="data.reference" type="string | null">Checkout reference you supplied, when available.</ResponseField>
<ResponseField name="data.customer" type="object | null">The customer who completed the checkout, or `null` if none was attached.</ResponseField>
<ResponseField name="data.charge" type="object | null">The resulting charge, in the same shape as `GET /v1/payments/charges/{charge_id}`. `null` for a free checkout, since no charge is created when nothing is collected.</ResponseField>
<ResponseField name="data.subscription" type="object | null">`{ subscription_id }` for a `subscription`-mode checkout. `null` for `payment` and `setup` modes.</ResponseField>
<ResponseField name="data.success_url" type="string | null">Where the customer was redirected after completing.</ResponseField>
<ResponseField name="data.cancel_url" type="string | null">Where the customer would have been redirected had they canceled.</ResponseField>
<ResponseField name="data.metadata" type="object">Public metadata stored on the checkout.</ResponseField>
<ResponseField name="data.completed_at" type="string">When the checkout completed, in UTC.</ResponseField>
<ResponseField name="data.expires_at" type="string | null">The checkout's original expiry time, in UTC.</ResponseField>
<ResponseField name="data.created_at" type="string">When the checkout session was created, in UTC.</ResponseField>


# checkout.expired
Source: https://docs.bachs.io/guides/webhooks/events/checkout-expired

Occurs when an open checkout session lapses past its expiry without the customer completing it.

Sent when a checkout session was never completed and its expiry time has passed. Use it to release held inventory, mark an order as abandoned, or send a recovery email.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a09",
    "type": "checkout.expired",
    "created_at": "2026-07-20T10:14:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "checkout_id": "chk_9x8y7z6w5v",
      "status": "expired",
      "mode": "payment",
      "payment_status": null,
      "amount": "19.00",
      "currency": "USD",
      "reference": "pay_abc123def456",
      "customer": {
        "customer_id": "cust_1a2b3c4d5e6f",
        "email": "jane@example.com",
        "name": "Jane Doe",
        "phone_number": null,
        "metadata": {},
        "billing_address": {
          "line1": "40 Yaba Road",
          "line2": null,
          "city": "Lagos",
          "state": "Lagos",
          "postal_code": "101245",
          "country": "NG"
        },
        "created_at": "2026-06-01T12:00:00Z",
        "updated_at": "2026-06-01T12:00:00Z"
      },
      "charge": null,
      "subscription": null,
      "success_url": "https://example.com/success",
      "cancel_url": "https://example.com/cancel",
      "metadata": {
        "order_id": "ORD-12345"
      },
      "completed_at": null,
      "expires_at": "2026-07-20T10:14:00.000000+00:00",
      "created_at": "2026-07-20T09:14:00.000000+00:00"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `checkout.expired`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.checkout_id" type="string">The checkout session that expired.</ResponseField>
<ResponseField name="data.status" type="string">Always `expired`.</ResponseField>
<ResponseField name="data.mode" type="string">The checkout's mode: `payment`, `setup`, or `subscription`.</ResponseField>
<ResponseField name="data.payment_status" type="null">Always `null`. An expired checkout never collected payment.</ResponseField>
<ResponseField name="data.amount" type="string">The amount the checkout would have collected, as a decimal string.</ResponseField>
<ResponseField name="data.currency" type="string | null">The checkout currency code.</ResponseField>
<ResponseField name="data.reference" type="string | null">Checkout reference you supplied, when available.</ResponseField>
<ResponseField name="data.customer" type="object | null">The customer attached to the checkout, or `null` if none was attached.</ResponseField>
<ResponseField name="data.charge" type="null">Always `null`. An expired checkout has no charge.</ResponseField>
<ResponseField name="data.subscription" type="null">Always `null`. An expired checkout never started a subscription.</ResponseField>
<ResponseField name="data.success_url" type="string | null">Where the customer would have been redirected on success.</ResponseField>
<ResponseField name="data.cancel_url" type="string | null">Where the customer would have been redirected had they canceled.</ResponseField>
<ResponseField name="data.metadata" type="object">Public metadata stored on the checkout.</ResponseField>
<ResponseField name="data.completed_at" type="null">Always `null`. The checkout was never completed.</ResponseField>
<ResponseField name="data.expires_at" type="string">When the checkout's expiry lapsed, in UTC.</ResponseField>
<ResponseField name="data.created_at" type="string">When the checkout session was created, in UTC.</ResponseField>


# collection.failed
Source: https://docs.bachs.io/guides/webhooks/events/collection-failed

Occurs when a payment attempt fails and reaches a failed terminal state.

Sent when a charge ends in a failed terminal state. Use it to notify the customer, retry, or release held inventory.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_87f6f546ba7148ffb1ecaf2a23f11a2f",
    "type": "collection.failed",
    "created_at": "2026-02-22T16:32:11.102345+00:00",
    "organization_id": "org_abc123",
    "data": {
      "charge_id": "chr_1a2b3c4d5e6f",
      "checkout_id": "chk_9x8y7z6w5v",
      "reference": "pay_abc123def456",
      "status": "FAILED",
      "amount": "75000.00",
      "currency": "NGN",
      "settlement_amount": "0.00",
      "settlement_currency": "NGN",
      "payment_method": "BANK_TRANSFER",
      "processing_fee": null,
      "processing_fee_currency": null,
      "fee_bearer": "merchant",
      "product_cart": [
        { "product_id": "prod_1a2b3c", "quantity": 2 }
      ],
      "customer": {
        "id": "cust_xyz789",
        "email": "jane@example.com",
        "name": "Jane Doe"
      },
      "reason": "Payment authorization failed",
      "metadata": {}
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`.</ResponseField>
<ResponseField name="type" type="string">Always `collection.failed`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.charge_id" type="string">Charge ID for support and reconciliation workflows.</ResponseField>
<ResponseField name="data.checkout_id" type="string | null">Checkout that originated the charge, when available.</ResponseField>
<ResponseField name="data.reference" type="string | null">Checkout reference, when available.</ResponseField>
<ResponseField name="data.status" type="string">Failed terminal state, typically `FAILED` or `EXPIRED`.</ResponseField>
<ResponseField name="data.amount" type="string">Original charge amount in `data.currency`.</ResponseField>
<ResponseField name="data.currency" type="string">Customer payment currency code.</ResponseField>
<ResponseField name="data.settlement_amount" type="string">Settlement amount, `0.00` for a failed charge.</ResponseField>
<ResponseField name="data.settlement_currency" type="string">Settlement currency.</ResponseField>
<ResponseField name="data.payment_method" type="string">Payment method attempted.</ResponseField>
<ResponseField name="data.reason" type="string | null">A human-readable reason for the failure, when available.</ResponseField>
<ResponseField name="data.customer" type="object">The customer, with `id`, `email`, and `name`.</ResponseField>
<ResponseField name="data.metadata" type="object">Public metadata stored with the charge.</ResponseField>


# collection.succeeded
Source: https://docs.bachs.io/guides/webhooks/events/collection-succeeded

Occurs when a payment is successfully collected from a customer.

Sent when a charge reaches a successful state. Use it to fulfill the order, grant access, or mark your own record as paid.

<Note>
  `data.charge_id` may be `null` in some scenarios:

  * **Test webhooks:** events sent from the webhook test tool are not backed by a real charge.
  * **Legacy payments:** collections processed before the charge model was introduced may not have an associated charge record.
  * **Manual reconciliation:** administrative payment confirmations applied outside the standard charge flow do not create a charge.

  Always guard against a null `charge_id` before using it for lookups.
</Note>

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_3ab4e0d5d27445cf8a52ab3d8cb8f0b1",
    "type": "collection.succeeded",
    "created_at": "2026-02-22T16:20:00.123456+00:00",
    "organization_id": "org_abc123",
    "data": {
      "charge_id": "chr_1a2b3c4d5e6f",
      "checkout_id": "chk_9x8y7z6w5v",
      "reference": "pay_abc123def456",
      "status": "SUCCEEDED",
      "amount": "75000.00",
      "currency": "NGN",
      "settlement_amount": "74250.00",
      "settlement_currency": "NGN",
      "payment_method": "BANK_TRANSFER",
      "processing_fee": "750.00",
      "processing_fee_currency": "NGN",
      "fee_bearer": "merchant",
      "product_cart": [
        { "product_id": "prod_1a2b3c", "quantity": 2 },
        { "product_id": "prod_9x8y7z", "quantity": 1, "amount": "5000.00" }
      ],
      "customer": {
        "id": "cust_xyz789",
        "email": "jane@example.com",
        "name": "Jane Doe"
      },
      "metadata": {
        "order_id": "ORD-12345"
      }
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `collection.succeeded`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.charge_id" type="string | null">Charge ID for reconciliation and retrieval calls. May be `null`, see note above.</ResponseField>
<ResponseField name="data.checkout_id" type="string | null">Checkout that originated the charge, when applicable.</ResponseField>
<ResponseField name="data.reference" type="string | null">Checkout reference you supplied, when available.</ResponseField>
<ResponseField name="data.status" type="string">Successful charge state. Typical values: `SUCCEEDED`, `ACCEPTED`, `OVERPAID`.</ResponseField>
<ResponseField name="data.amount" type="string">Original charged amount in `data.currency`.</ResponseField>
<ResponseField name="data.currency" type="string">Customer payment currency code.</ResponseField>
<ResponseField name="data.settlement_amount" type="string">Amount credited in `data.settlement_currency`.</ResponseField>
<ResponseField name="data.settlement_currency" type="string">Currency used for settlement credit.</ResponseField>
<ResponseField name="data.payment_method" type="string">Payment method used to process this charge, e.g. `BANK_TRANSFER`, `CARD`, `MOBILE_MONEY`.</ResponseField>
<ResponseField name="data.processing_fee" type="string | null">Platform processing fee in `data.processing_fee_currency`. Null when the final settlement value has not yet been determined (deferred settlement).</ResponseField>
<ResponseField name="data.processing_fee_currency" type="string | null">Currency of `data.processing_fee`, typically the settlement currency. Null when `processing_fee` is null.</ResponseField>
<ResponseField name="data.fee_bearer" type="string">Who absorbed the processing fee. Either `customer` (fee added on top of the charge amount) or `merchant` (fee deducted from settlement).</ResponseField>
<ResponseField name="data.product_cart" type="array | null">Products purchased in a one-time checkout session. Each item contains `product_id`, `quantity`, and `amount` (present only for custom-priced products).</ResponseField>
<ResponseField name="data.customer" type="object">The customer who made the payment, with `id`, `email`, and `name`.</ResponseField>
<ResponseField name="data.metadata" type="object">Public metadata stored with the charge.</ResponseField>


# collection.underpaid
Source: https://docs.bachs.io/guides/webhooks/events/collection-underpaid

Occurs when a customer pays less than the amount due.

Sent when a customer sends less than the charge amount. Use it to decide whether to accept the partial payment, request the balance, or refund it.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a",
    "type": "collection.underpaid",
    "created_at": "2026-02-22T17:10:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "charge_id": "chr_1a2b3c4d5e6f",
      "reference": "pay_abc123def456",
      "checkout_id": "chk_9x8y7z6w5v",
      "amount_paid": "50000.00",
      "amount_expected": "75000.00",
      "amount_remaining": "25000.00",
      "currency": "NGN",
      "status": "UNDERPAID",
      "provider_reference": "kora_ref_abc123",
      "metadata": {}
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`.</ResponseField>
<ResponseField name="type" type="string">Always `collection.underpaid`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.charge_id" type="string">The underpaid charge's ID.</ResponseField>
<ResponseField name="data.reference" type="string | null">Checkout reference, when available.</ResponseField>
<ResponseField name="data.checkout_id" type="string | null">The checkout that originated the charge.</ResponseField>
<ResponseField name="data.amount_paid" type="string">Amount the customer actually paid, in `data.currency`.</ResponseField>
<ResponseField name="data.amount_expected" type="string">Amount that was due.</ResponseField>
<ResponseField name="data.amount_remaining" type="string">The shortfall: `amount_expected` minus `amount_paid`.</ResponseField>
<ResponseField name="data.currency" type="string">Customer payment currency code.</ResponseField>
<ResponseField name="data.status" type="string">Always `UNDERPAID`.</ResponseField>
<ResponseField name="data.provider_reference" type="string | null">The payment provider's reference for the transaction.</ResponseField>
<ResponseField name="data.metadata" type="object">Public metadata stored with the charge.</ResponseField>


# conversion.completed
Source: https://docs.bachs.io/guides/webhooks/events/conversion-completed

Occurs when a currency conversion completes successfully.

Sent when a conversion settles. Use it to record the converted balance.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "conversion.completed",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "conversion_id": "cnv_1a2b3c4d5e",
      "quote_id": "cq_1a2b3c4d5e",
      "from_currency": "USD",
      "to_currency": "NGN",
      "from_amount": "100.00",
      "to_amount": "165000.00",
      "exchange_rate": "1650.00",
      "status": "completed",
      "created_at": "2026-04-27T12:00:00Z"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `conversion.completed`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.conversion_id" type="string">The conversion's ID.</ResponseField>
<ResponseField name="data.quote_id" type="string">The quote the conversion was executed against.</ResponseField>
<ResponseField name="data.from_currency" type="string">The source currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.to_currency" type="string">The target currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.from_amount" type="string">The amount converted from, as a decimal string.</ResponseField>
<ResponseField name="data.to_amount" type="string">The amount received in the target currency.</ResponseField>
<ResponseField name="data.exchange_rate" type="string">The FX rate applied.</ResponseField>
<ResponseField name="data.status" type="string">Conversion status, e.g. `completed`, `failed`.</ResponseField>


# conversion.failed
Source: https://docs.bachs.io/guides/webhooks/events/conversion-failed

Occurs when a currency conversion fails.

Sent when a conversion fails. Use it to retry or surface the failure.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "conversion.failed",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "conversion_id": "cnv_1a2b3c4d5e",
      "quote_id": "cq_1a2b3c4d5e",
      "from_currency": "USD",
      "to_currency": "NGN",
      "from_amount": "100.00",
      "to_amount": "165000.00",
      "exchange_rate": "1650.00",
      "status": "failed",
      "created_at": "2026-04-27T12:00:00Z"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `conversion.failed`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.conversion_id" type="string">The conversion's ID.</ResponseField>
<ResponseField name="data.quote_id" type="string">The quote the conversion was executed against.</ResponseField>
<ResponseField name="data.from_currency" type="string">The source currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.to_currency" type="string">The target currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.from_amount" type="string">The amount converted from, as a decimal string.</ResponseField>
<ResponseField name="data.to_amount" type="string">The amount received in the target currency.</ResponseField>
<ResponseField name="data.exchange_rate" type="string">The FX rate applied.</ResponseField>
<ResponseField name="data.status" type="string">Conversion status, e.g. `completed`, `failed`.</ResponseField>


# customer.created
Source: https://docs.bachs.io/guides/webhooks/events/customer-created

Occurs when a new customer is created.

Sent when a customer is created, whether from a checkout or the API. Use it to sync customers into your system.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "customer.created",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "customer_id": "cust_1a2b3c4d5e6f",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "phone_number": "+2348012345678",
      "metadata": {},
      "billing_address": {
        "line1": "40 Yaba Road",
        "line2": null,
        "city": "Lagos",
        "state": "Lagos",
        "postal_code": "101245",
        "country": "NG"
      },
      "created_at": "2026-04-27T12:00:00Z",
      "updated_at": "2026-04-27T12:00:00Z"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `customer.created`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.customer_id" type="string">The customer's ID, prefixed `cust_`.</ResponseField>
<ResponseField name="data.email" type="string">The customer's email address.</ResponseField>
<ResponseField name="data.name" type="string | null">The customer's name.</ResponseField>
<ResponseField name="data.phone_number" type="string | null">The customer's phone number in E.164 format.</ResponseField>
<ResponseField name="data.metadata" type="object">Your own key-value data on the customer.</ResponseField>
<ResponseField name="data.billing_address" type="object | null">The customer's billing address: `line1`, `line2`, `city`, `state`, `postal_code`, and `country` (ISO-3166-1 alpha-2). `null` when no address is stored.</ResponseField>
<ResponseField name="data.created_at" type="string">When the customer was created, in UTC.</ResponseField>
<ResponseField name="data.updated_at" type="string">When the customer was last updated, in UTC.</ResponseField>


# customer.subscription.created
Source: https://docs.bachs.io/guides/webhooks/events/customer-subscription-created

Occurs when a subscription is created after a customer completes a recurring checkout.

Sent when a new subscription is created. Use it to provision access to the recurring product.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "customer.subscription.created",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "subscription_id": "sub_1a2b3c4d5e",
      "customer": {
        "customer_id": "cust_1a2b3c4d5e6f",
        "email": "jane@example.com",
        "name": "Jane Doe",
        "phone_number": "+2348012345678",
        "metadata": {},
        "billing_address": {
          "line1": "40 Yaba Road",
          "line2": null,
          "city": "Lagos",
          "state": "Lagos",
          "postal_code": "101245",
          "country": "NG"
        },
        "created_at": "2026-03-01T12:00:00Z",
        "updated_at": "2026-03-01T12:00:00Z"
      },
      "product_id": "prod_abc123",
      "status": "active",
      "collection_method": "charge_automatically",
      "currency": "USD",
      "amount": "10.00",
      "billing_cycle": { "interval": "month", "frequency": 1 },
      "quantity": 1,
      "current_period_start": "2026-04-01T00:00:00Z",
      "current_period_end": "2026-05-01T00:00:00Z",
      "next_billed_at": "2026-05-01T00:00:00Z",
      "trial_end": null,
      "cancel_at_period_end": false,
      "canceled_at": null,
      "created_at": "2026-03-01T12:00:00Z",
      "items": [],
      "metadata": {}
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `customer.subscription.created`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.subscription_id" type="string">The subscription's ID.</ResponseField>
<ResponseField name="data.customer" type="object">The full customer object: `customer_id`, `email`, `name`, `phone_number`, `metadata`, `billing_address`, `created_at`, and `updated_at`.</ResponseField>
<ResponseField name="data.product_id" type="string">The product the subscription bills.</ResponseField>
<ResponseField name="data.status" type="string">Subscription status: `trialing`, `active`, `past_due`, `unpaid`, `canceled`, or `paused`.</ResponseField>
<ResponseField name="data.collection_method" type="string">How renewals are collected, e.g. `charge_automatically`.</ResponseField>
<ResponseField name="data.currency" type="string">The billing currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.amount" type="string">The recurring amount, as a decimal string.</ResponseField>
<ResponseField name="data.billing_cycle" type="object">The cadence: `{ interval, frequency }`.</ResponseField>
<ResponseField name="data.current_period_start" type="string">Start of the current billing period, in UTC.</ResponseField>
<ResponseField name="data.current_period_end" type="string">End of the current billing period, in UTC.</ResponseField>
<ResponseField name="data.next_billed_at" type="string | null">When the subscription next renews, in UTC.</ResponseField>
<ResponseField name="data.trial_end" type="string | null">When the trial ends, or `null` if not trialing.</ResponseField>
<ResponseField name="data.cancel_at_period_end" type="boolean">Whether the subscription is set to end at the period end.</ResponseField>
<ResponseField name="data.canceled_at" type="string | null">When the subscription was canceled, or `null`.</ResponseField>
<ResponseField name="data.items" type="object[]">The line items being billed.</ResponseField>
<ResponseField name="data.metadata" type="object">Your own key-value data on the subscription.</ResponseField>


# customer.subscription.deleted
Source: https://docs.bachs.io/guides/webhooks/events/customer-subscription-deleted

Occurs when a subscription is canceled and will no longer renew.

Sent when a subscription is canceled. Use it to revoke access at the right time (immediately, or at period end).

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "customer.subscription.deleted",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "subscription_id": "sub_1a2b3c4d5e",
      "customer": {
        "customer_id": "cust_1a2b3c4d5e6f",
        "email": "jane@example.com",
        "name": "Jane Doe",
        "phone_number": "+2348012345678",
        "metadata": {},
        "billing_address": {
          "line1": "40 Yaba Road",
          "line2": null,
          "city": "Lagos",
          "state": "Lagos",
          "postal_code": "101245",
          "country": "NG"
        },
        "created_at": "2026-03-01T12:00:00Z",
        "updated_at": "2026-03-01T12:00:00Z"
      },
      "product_id": "prod_abc123",
      "status": "canceled",
      "collection_method": "charge_automatically",
      "currency": "USD",
      "amount": "10.00",
      "billing_cycle": { "interval": "month", "frequency": 1 },
      "quantity": 1,
      "current_period_start": "2026-04-01T00:00:00Z",
      "current_period_end": "2026-05-01T00:00:00Z",
      "next_billed_at": "2026-05-01T00:00:00Z",
      "trial_end": null,
      "cancel_at_period_end": false,
      "canceled_at": "2026-04-15T00:00:00Z",
      "created_at": "2026-03-01T12:00:00Z",
      "items": [],
      "metadata": {}
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `customer.subscription.deleted`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.subscription_id" type="string">The subscription's ID.</ResponseField>
<ResponseField name="data.customer" type="object">The full customer object: `customer_id`, `email`, `name`, `phone_number`, `metadata`, `billing_address`, `created_at`, and `updated_at`.</ResponseField>
<ResponseField name="data.product_id" type="string">The product the subscription bills.</ResponseField>
<ResponseField name="data.status" type="string">Subscription status: `trialing`, `active`, `past_due`, `unpaid`, `canceled`, or `paused`.</ResponseField>
<ResponseField name="data.collection_method" type="string">How renewals are collected, e.g. `charge_automatically`.</ResponseField>
<ResponseField name="data.currency" type="string">The billing currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.amount" type="string">The recurring amount, as a decimal string.</ResponseField>
<ResponseField name="data.billing_cycle" type="object">The cadence: `{ interval, frequency }`.</ResponseField>
<ResponseField name="data.current_period_start" type="string">Start of the current billing period, in UTC.</ResponseField>
<ResponseField name="data.current_period_end" type="string">End of the current billing period, in UTC.</ResponseField>
<ResponseField name="data.next_billed_at" type="string | null">When the subscription next renews, in UTC.</ResponseField>
<ResponseField name="data.trial_end" type="string | null">When the trial ends, or `null` if not trialing.</ResponseField>
<ResponseField name="data.cancel_at_period_end" type="boolean">Whether the subscription is set to end at the period end.</ResponseField>
<ResponseField name="data.canceled_at" type="string | null">When the subscription was canceled, or `null`.</ResponseField>
<ResponseField name="data.items" type="object[]">The line items being billed.</ResponseField>
<ResponseField name="data.metadata" type="object">Your own key-value data on the subscription.</ResponseField>


# customer.subscription.updated
Source: https://docs.bachs.io/guides/webhooks/events/customer-subscription-updated

Occurs when a subscription changes: a plan change, trial move, payment-method swap, or status transition.

Sent whenever a subscription changes. Key off `status` and the period fields to reconcile access.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "customer.subscription.updated",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "subscription_id": "sub_1a2b3c4d5e",
      "customer": {
        "customer_id": "cust_1a2b3c4d5e6f",
        "email": "jane@example.com",
        "name": "Jane Doe",
        "phone_number": "+2348012345678",
        "metadata": {},
        "billing_address": {
          "line1": "40 Yaba Road",
          "line2": null,
          "city": "Lagos",
          "state": "Lagos",
          "postal_code": "101245",
          "country": "NG"
        },
        "created_at": "2026-03-01T12:00:00Z",
        "updated_at": "2026-03-01T12:00:00Z"
      },
      "product_id": "prod_abc123",
      "status": "active",
      "collection_method": "charge_automatically",
      "currency": "USD",
      "amount": "10.00",
      "billing_cycle": { "interval": "month", "frequency": 1 },
      "quantity": 1,
      "current_period_start": "2026-04-01T00:00:00Z",
      "current_period_end": "2026-05-01T00:00:00Z",
      "next_billed_at": "2026-05-01T00:00:00Z",
      "trial_end": null,
      "cancel_at_period_end": false,
      "canceled_at": null,
      "created_at": "2026-03-01T12:00:00Z",
      "items": [],
      "metadata": {}
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `customer.subscription.updated`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.subscription_id" type="string">The subscription's ID.</ResponseField>
<ResponseField name="data.customer" type="object">The full customer object: `customer_id`, `email`, `name`, `phone_number`, `metadata`, `billing_address`, `created_at`, and `updated_at`.</ResponseField>
<ResponseField name="data.product_id" type="string">The product the subscription bills.</ResponseField>
<ResponseField name="data.status" type="string">Subscription status: `trialing`, `active`, `past_due`, `unpaid`, `canceled`, or `paused`.</ResponseField>
<ResponseField name="data.collection_method" type="string">How renewals are collected, e.g. `charge_automatically`.</ResponseField>
<ResponseField name="data.currency" type="string">The billing currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.amount" type="string">The recurring amount, as a decimal string.</ResponseField>
<ResponseField name="data.billing_cycle" type="object">The cadence: `{ interval, frequency }`.</ResponseField>
<ResponseField name="data.current_period_start" type="string">Start of the current billing period, in UTC.</ResponseField>
<ResponseField name="data.current_period_end" type="string">End of the current billing period, in UTC.</ResponseField>
<ResponseField name="data.next_billed_at" type="string | null">When the subscription next renews, in UTC.</ResponseField>
<ResponseField name="data.trial_end" type="string | null">When the trial ends, or `null` if not trialing.</ResponseField>
<ResponseField name="data.cancel_at_period_end" type="boolean">Whether the subscription is set to end at the period end.</ResponseField>
<ResponseField name="data.canceled_at" type="string | null">When the subscription was canceled, or `null`.</ResponseField>
<ResponseField name="data.items" type="object[]">The line items being billed.</ResponseField>
<ResponseField name="data.metadata" type="object">Your own key-value data on the subscription.</ResponseField>


# customer.updated
Source: https://docs.bachs.io/guides/webhooks/events/customer-updated

Occurs when a customer's details change.

Sent when a customer is updated. Use it to keep your copy of the customer in sync.

Creating a customer with an email that already exists returns the existing customer with your changes applied, so that call emits `customer.updated` rather than `customer.created`.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "customer.updated",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "customer_id": "cust_1a2b3c4d5e6f",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "phone_number": "+2348012345678",
      "metadata": {},
      "billing_address": {
        "line1": "40 Yaba Road",
        "line2": null,
        "city": "Lagos",
        "state": "Lagos",
        "postal_code": "101245",
        "country": "NG"
      },
      "created_at": "2026-04-27T12:00:00Z",
      "updated_at": "2026-04-27T12:00:00Z"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `customer.updated`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.customer_id" type="string">The customer's ID, prefixed `cust_`.</ResponseField>
<ResponseField name="data.email" type="string">The customer's email address.</ResponseField>
<ResponseField name="data.name" type="string | null">The customer's name.</ResponseField>
<ResponseField name="data.phone_number" type="string | null">The customer's phone number in E.164 format.</ResponseField>
<ResponseField name="data.metadata" type="object">Your own key-value data on the customer.</ResponseField>
<ResponseField name="data.billing_address" type="object | null">The customer's billing address: `line1`, `line2`, `city`, `state`, `postal_code`, and `country` (ISO-3166-1 alpha-2). `null` when no address is stored. Sent whenever an update changes it.</ResponseField>
<ResponseField name="data.created_at" type="string">When the customer was created, in UTC.</ResponseField>
<ResponseField name="data.updated_at" type="string">When the customer was last updated, in UTC.</ResponseField>


# dispute.created
Source: https://docs.bachs.io/guides/webhooks/events/dispute-created

Occurs when a customer's bank raises a dispute (chargeback) against a charge.

Sent when a dispute is opened. Respond before `response_deadline_at` with evidence.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "dispute.created",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "dispute_id": "dsp_1a2b3c4d5e",
      "charge_id": "chr_1a2b3c4d5e6f",
      "amount": "75000.00",
      "currency": "NGN",
      "status": "needs_response",
      "is_response_editable": true,
      "reason": "fraudulent",
      "response_deadline_at": "2026-05-10T00:00:00Z",
      "created_at": "2026-04-27T12:00:00Z",
      "updated_at": "2026-04-27T12:00:00Z"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `dispute.created`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.dispute_id" type="string">The dispute's ID.</ResponseField>
<ResponseField name="data.charge_id" type="string">The disputed charge.</ResponseField>
<ResponseField name="data.amount" type="string">The disputed amount, as a decimal string.</ResponseField>
<ResponseField name="data.currency" type="string">The dispute currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.status" type="string">Dispute status, e.g. `needs_response`, `under_review`, `won`, `lost`.</ResponseField>
<ResponseField name="data.is_response_editable" type="boolean">Whether you can still submit or update evidence.</ResponseField>
<ResponseField name="data.reason" type="string | null">The reason the dispute was raised.</ResponseField>
<ResponseField name="data.response_deadline_at" type="string | null">When your evidence is due, in UTC.</ResponseField>


# dispute.updated
Source: https://docs.bachs.io/guides/webhooks/events/dispute-updated

Occurs when a dispute changes status or evidence is updated.

Sent when a dispute progresses. Key off `status` to know whether it was won or lost.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "dispute.updated",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "dispute_id": "dsp_1a2b3c4d5e",
      "charge_id": "chr_1a2b3c4d5e6f",
      "amount": "75000.00",
      "currency": "NGN",
      "status": "under_review",
      "is_response_editable": true,
      "reason": "fraudulent",
      "response_deadline_at": "2026-05-10T00:00:00Z",
      "created_at": "2026-04-27T12:00:00Z",
      "updated_at": "2026-04-27T12:00:00Z"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `dispute.updated`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.dispute_id" type="string">The dispute's ID.</ResponseField>
<ResponseField name="data.charge_id" type="string">The disputed charge.</ResponseField>
<ResponseField name="data.amount" type="string">The disputed amount, as a decimal string.</ResponseField>
<ResponseField name="data.currency" type="string">The dispute currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.status" type="string">Dispute status, e.g. `needs_response`, `under_review`, `won`, `lost`.</ResponseField>
<ResponseField name="data.is_response_editable" type="boolean">Whether you can still submit or update evidence.</ResponseField>
<ResponseField name="data.reason" type="string | null">The reason the dispute was raised.</ResponseField>
<ResponseField name="data.response_deadline_at" type="string | null">When your evidence is due, in UTC.</ResponseField>


# invoice.created
Source: https://docs.bachs.io/guides/webhooks/events/invoice-created

Occurs when an invoice is created for a subscription cycle or a one-off charge.

Sent when an invoice is created, before collection. Use it to record the amount due.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "invoice.created",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "invoice_id": "inv_1a2b3c4d5e",
      "subscription": { "subscription_id": "sub_1a2b3c4d5e" },
      "customer": { "customer_id": "cust_1a2b3c4d5e6f", "email": "jane@example.com", "name": "Jane Doe" },
      "charge": null,
      "status": "open",
      "collection_method": "charge_automatically",
      "currency": "USD",
      "subtotal": "10.00",
      "total": "10.00",
      "amount_paid": "0.00",
      "amount_remaining": "10.00",
      "period_start": "2026-04-01T00:00:00Z",
      "period_end": "2026-05-01T00:00:00Z",
      "attempt_count": 0,
      "next_payment_attempt": "2026-04-01T00:05:00Z",
      "created_at": "2026-04-01T00:00:00Z",
      "metadata": {}
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `invoice.created`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.invoice_id" type="string">The invoice's ID.</ResponseField>
<ResponseField name="data.subscription" type="object | null">The subscription this invoice belongs to, or `null` for a one-off.</ResponseField>
<ResponseField name="data.customer" type="object">The customer the invoice is for.</ResponseField>
<ResponseField name="data.charge" type="object | null">The payment that collected the invoice, once collection is attempted.</ResponseField>
<ResponseField name="data.status" type="string">Invoice status: `draft`, `open`, `paid`, `uncollectible`, or `void`.</ResponseField>
<ResponseField name="data.collection_method" type="string">How the invoice is collected, e.g. `charge_automatically`.</ResponseField>
<ResponseField name="data.currency" type="string">The invoice currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.subtotal" type="string">The subtotal before credits, as a decimal string.</ResponseField>
<ResponseField name="data.total" type="string">The total due, as a decimal string.</ResponseField>
<ResponseField name="data.amount_paid" type="string">Amount paid so far.</ResponseField>
<ResponseField name="data.amount_remaining" type="string">Amount still due.</ResponseField>
<ResponseField name="data.period_start" type="string">Start of the billing period, in UTC.</ResponseField>
<ResponseField name="data.period_end" type="string">End of the billing period, in UTC.</ResponseField>
<ResponseField name="data.attempt_count" type="integer">Number of collection attempts made.</ResponseField>
<ResponseField name="data.next_payment_attempt" type="string | null">When the next collection attempt is scheduled.</ResponseField>
<ResponseField name="data.metadata" type="object">Your own key-value data on the invoice.</ResponseField>


# invoice.paid
Source: https://docs.bachs.io/guides/webhooks/events/invoice-paid

Occurs when an invoice is paid in full.

Sent when an invoice is paid. Use it to extend the subscription period or mark the bill settled.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "invoice.paid",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "invoice_id": "inv_1a2b3c4d5e",
      "subscription": { "subscription_id": "sub_1a2b3c4d5e" },
      "customer": { "customer_id": "cust_1a2b3c4d5e6f", "email": "jane@example.com", "name": "Jane Doe" },
      "charge": null,
      "status": "paid",
      "collection_method": "charge_automatically",
      "currency": "USD",
      "subtotal": "10.00",
      "total": "10.00",
      "amount_paid": "10.00",
      "amount_remaining": "0.00",
      "period_start": "2026-04-01T00:00:00Z",
      "period_end": "2026-05-01T00:00:00Z",
      "attempt_count": 0,
      "next_payment_attempt": "2026-04-01T00:05:00Z",
      "created_at": "2026-04-01T00:00:00Z",
      "metadata": {}
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `invoice.paid`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.invoice_id" type="string">The invoice's ID.</ResponseField>
<ResponseField name="data.subscription" type="object | null">The subscription this invoice belongs to, or `null` for a one-off.</ResponseField>
<ResponseField name="data.customer" type="object">The customer the invoice is for.</ResponseField>
<ResponseField name="data.charge" type="object | null">The payment that collected the invoice, once collection is attempted.</ResponseField>
<ResponseField name="data.status" type="string">Invoice status: `draft`, `open`, `paid`, `uncollectible`, or `void`.</ResponseField>
<ResponseField name="data.collection_method" type="string">How the invoice is collected, e.g. `charge_automatically`.</ResponseField>
<ResponseField name="data.currency" type="string">The invoice currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.subtotal" type="string">The subtotal before credits, as a decimal string.</ResponseField>
<ResponseField name="data.total" type="string">The total due, as a decimal string.</ResponseField>
<ResponseField name="data.amount_paid" type="string">Amount paid so far.</ResponseField>
<ResponseField name="data.amount_remaining" type="string">Amount still due.</ResponseField>
<ResponseField name="data.period_start" type="string">Start of the billing period, in UTC.</ResponseField>
<ResponseField name="data.period_end" type="string">End of the billing period, in UTC.</ResponseField>
<ResponseField name="data.attempt_count" type="integer">Number of collection attempts made.</ResponseField>
<ResponseField name="data.next_payment_attempt" type="string | null">When the next collection attempt is scheduled.</ResponseField>
<ResponseField name="data.metadata" type="object">Your own key-value data on the invoice.</ResponseField>


# invoice.payment_failed
Source: https://docs.bachs.io/guides/webhooks/events/invoice-payment-failed

Occurs when an attempt to collect an invoice fails.

Sent when collecting an invoice fails. Use it to start dunning or notify the customer to update their card.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "invoice.payment_failed",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "invoice_id": "inv_1a2b3c4d5e",
      "subscription": { "subscription_id": "sub_1a2b3c4d5e" },
      "customer": { "customer_id": "cust_1a2b3c4d5e6f", "email": "jane@example.com", "name": "Jane Doe" },
      "charge": null,
      "status": "open",
      "collection_method": "charge_automatically",
      "currency": "USD",
      "subtotal": "10.00",
      "total": "10.00",
      "amount_paid": "0.00",
      "amount_remaining": "10.00",
      "period_start": "2026-04-01T00:00:00Z",
      "period_end": "2026-05-01T00:00:00Z",
      "attempt_count": 1,
      "next_payment_attempt": "2026-04-01T00:05:00Z",
      "created_at": "2026-04-01T00:00:00Z",
      "metadata": {}
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `invoice.payment_failed`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.invoice_id" type="string">The invoice's ID.</ResponseField>
<ResponseField name="data.subscription" type="object | null">The subscription this invoice belongs to, or `null` for a one-off.</ResponseField>
<ResponseField name="data.customer" type="object">The customer the invoice is for.</ResponseField>
<ResponseField name="data.charge" type="object | null">The payment that collected the invoice, once collection is attempted.</ResponseField>
<ResponseField name="data.status" type="string">Invoice status: `draft`, `open`, `paid`, `uncollectible`, or `void`.</ResponseField>
<ResponseField name="data.collection_method" type="string">How the invoice is collected, e.g. `charge_automatically`.</ResponseField>
<ResponseField name="data.currency" type="string">The invoice currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.subtotal" type="string">The subtotal before credits, as a decimal string.</ResponseField>
<ResponseField name="data.total" type="string">The total due, as a decimal string.</ResponseField>
<ResponseField name="data.amount_paid" type="string">Amount paid so far.</ResponseField>
<ResponseField name="data.amount_remaining" type="string">Amount still due.</ResponseField>
<ResponseField name="data.period_start" type="string">Start of the billing period, in UTC.</ResponseField>
<ResponseField name="data.period_end" type="string">End of the billing period, in UTC.</ResponseField>
<ResponseField name="data.attempt_count" type="integer">Number of collection attempts made.</ResponseField>
<ResponseField name="data.next_payment_attempt" type="string | null">When the next collection attempt is scheduled.</ResponseField>
<ResponseField name="data.metadata" type="object">Your own key-value data on the invoice.</ResponseField>


# payout.created
Source: https://docs.bachs.io/guides/webhooks/events/payout-created

Occurs when a payout (withdrawal) is created and begins processing.

Sent when you initiate a payout. Use it to track the withdrawal from request to settlement.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "payout.created",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "withdrawal_id": "wd_1a2b3c4d5e",
      "reference": "payout_9876",
      "provider_reference": "prov_ref_abc123",
      "status": "PENDING",
      "amount": "500.00",
      "currency": "USD",
      "from_currency": "USD",
      "to_currency": "NGN",
      "exchange_rate": "1650.00",
      "to_amount": "825000.00",
      "withdrawal_fee": "2.50",
      "net_from_amount": "497.50"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `payout.created`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.withdrawal_id" type="string">The payout's ID.</ResponseField>
<ResponseField name="data.reference" type="string | null">Your reference for the payout, or the one Bachs generated.</ResponseField>
<ResponseField name="data.provider_reference" type="string | null">The payout provider's reference.</ResponseField>
<ResponseField name="data.status" type="string">Payout status, e.g. `PENDING`, `PAID`, `FAILED`.</ResponseField>
<ResponseField name="data.amount" type="string">The payout amount in `data.currency`.</ResponseField>
<ResponseField name="data.currency" type="string">The source currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.from_currency" type="string | null">The currency debited from your balance.</ResponseField>
<ResponseField name="data.to_currency" type="string | null">The currency delivered to the destination.</ResponseField>
<ResponseField name="data.exchange_rate" type="string | null">The FX rate applied, when a conversion occurred.</ResponseField>
<ResponseField name="data.to_amount" type="string | null">The amount delivered in `data.to_currency`.</ResponseField>
<ResponseField name="data.withdrawal_fee" type="string | null">The payout fee, when applicable.</ResponseField>
<ResponseField name="data.net_from_amount" type="string | null">The net amount debited after fees.</ResponseField>


# payout.failed
Source: https://docs.bachs.io/guides/webhooks/events/payout-failed

Occurs when a payout fails to be delivered.

Sent when a payout fails. Use it to notify your team and retry or correct the destination.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "payout.failed",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "withdrawal_id": "wd_1a2b3c4d5e",
      "reference": "payout_9876",
      "provider_reference": "prov_ref_abc123",
      "status": "FAILED",
      "amount": "500.00",
      "currency": "USD",
      "from_currency": "USD",
      "to_currency": "NGN",
      "exchange_rate": "1650.00",
      "to_amount": "825000.00",
      "withdrawal_fee": "2.50",
      "net_from_amount": "497.50"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `payout.failed`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.withdrawal_id" type="string">The payout's ID.</ResponseField>
<ResponseField name="data.reference" type="string | null">Your reference for the payout, or the one Bachs generated.</ResponseField>
<ResponseField name="data.provider_reference" type="string | null">The payout provider's reference.</ResponseField>
<ResponseField name="data.status" type="string">Payout status, e.g. `PENDING`, `PAID`, `FAILED`.</ResponseField>
<ResponseField name="data.amount" type="string">The payout amount in `data.currency`.</ResponseField>
<ResponseField name="data.currency" type="string">The source currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.from_currency" type="string | null">The currency debited from your balance.</ResponseField>
<ResponseField name="data.to_currency" type="string | null">The currency delivered to the destination.</ResponseField>
<ResponseField name="data.exchange_rate" type="string | null">The FX rate applied, when a conversion occurred.</ResponseField>
<ResponseField name="data.to_amount" type="string | null">The amount delivered in `data.to_currency`.</ResponseField>
<ResponseField name="data.withdrawal_fee" type="string | null">The payout fee, when applicable.</ResponseField>
<ResponseField name="data.net_from_amount" type="string | null">The net amount debited after fees.</ResponseField>


# payout.paid
Source: https://docs.bachs.io/guides/webhooks/events/payout-paid

Occurs when a payout is delivered to its destination.

Sent when a payout completes. Use it to confirm funds reached the destination account.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "payout.paid",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "withdrawal_id": "wd_1a2b3c4d5e",
      "reference": "payout_9876",
      "provider_reference": "prov_ref_abc123",
      "status": "PAID",
      "amount": "500.00",
      "currency": "USD",
      "from_currency": "USD",
      "to_currency": "NGN",
      "exchange_rate": "1650.00",
      "to_amount": "825000.00",
      "withdrawal_fee": "2.50",
      "net_from_amount": "497.50"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `payout.paid`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.withdrawal_id" type="string">The payout's ID.</ResponseField>
<ResponseField name="data.reference" type="string | null">Your reference for the payout, or the one Bachs generated.</ResponseField>
<ResponseField name="data.provider_reference" type="string | null">The payout provider's reference.</ResponseField>
<ResponseField name="data.status" type="string">Payout status, e.g. `PENDING`, `PAID`, `FAILED`.</ResponseField>
<ResponseField name="data.amount" type="string">The payout amount in `data.currency`.</ResponseField>
<ResponseField name="data.currency" type="string">The source currency, as an ISO 4217 code.</ResponseField>
<ResponseField name="data.from_currency" type="string | null">The currency debited from your balance.</ResponseField>
<ResponseField name="data.to_currency" type="string | null">The currency delivered to the destination.</ResponseField>
<ResponseField name="data.exchange_rate" type="string | null">The FX rate applied, when a conversion occurred.</ResponseField>
<ResponseField name="data.to_amount" type="string | null">The amount delivered in `data.to_currency`.</ResponseField>
<ResponseField name="data.withdrawal_fee" type="string | null">The payout fee, when applicable.</ResponseField>
<ResponseField name="data.net_from_amount" type="string | null">The net amount debited after fees.</ResponseField>


# refund.created
Source: https://docs.bachs.io/guides/webhooks/events/refund-created

Occurs when a refund is created and begins processing.

Sent when you create a refund. Use it to track the refund to completion.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "refund.created",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "refund_id": "ref_1a2b3c4d5e",
      "charge_id": "chr_1a2b3c4d5e6f",
      "reference": "refund_9876",
      "status": "processing",
      "requested_amount": "10.00",
      "refunded_amount": "0.00",
      "refund_fee_amount": "0.00",
      "fee_bearer": "merchant",
      "reason": "Customer request"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `refund.created`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.refund_id" type="string">The refund's ID.</ResponseField>
<ResponseField name="data.charge_id" type="string">The charge being refunded.</ResponseField>
<ResponseField name="data.reference" type="string | null">Your reference for the refund, or the one Bachs generated.</ResponseField>
<ResponseField name="data.status" type="string">Refund status, e.g. `processing`, `paid`, `failed`.</ResponseField>
<ResponseField name="data.requested_amount" type="string">The amount requested to refund, as a decimal string.</ResponseField>
<ResponseField name="data.refunded_amount" type="string | null">The amount actually refunded so far.</ResponseField>
<ResponseField name="data.refund_fee_amount" type="string">The fee charged on the refund, if any.</ResponseField>
<ResponseField name="data.fee_bearer" type="string">Who absorbs the refund fee, `customer` or `merchant`.</ResponseField>
<ResponseField name="data.reason" type="string | null">The reason for the refund, when provided.</ResponseField>


# refund.failed
Source: https://docs.bachs.io/guides/webhooks/events/refund-failed

Occurs when a refund fails to be delivered.

Sent when a refund fails. Use it to retry or investigate.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "refund.failed",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "refund_id": "ref_1a2b3c4d5e",
      "charge_id": "chr_1a2b3c4d5e6f",
      "reference": "refund_9876",
      "status": "failed",
      "requested_amount": "10.00",
      "refunded_amount": "0.00",
      "refund_fee_amount": "0.00",
      "fee_bearer": "merchant",
      "reason": "Customer request"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `refund.failed`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.refund_id" type="string">The refund's ID.</ResponseField>
<ResponseField name="data.charge_id" type="string">The charge being refunded.</ResponseField>
<ResponseField name="data.reference" type="string | null">Your reference for the refund, or the one Bachs generated.</ResponseField>
<ResponseField name="data.status" type="string">Refund status, e.g. `processing`, `paid`, `failed`.</ResponseField>
<ResponseField name="data.requested_amount" type="string">The amount requested to refund, as a decimal string.</ResponseField>
<ResponseField name="data.refunded_amount" type="string | null">The amount actually refunded so far.</ResponseField>
<ResponseField name="data.refund_fee_amount" type="string">The fee charged on the refund, if any.</ResponseField>
<ResponseField name="data.fee_bearer" type="string">Who absorbs the refund fee, `customer` or `merchant`.</ResponseField>
<ResponseField name="data.reason" type="string | null">The reason for the refund, when provided.</ResponseField>


# refund.paid
Source: https://docs.bachs.io/guides/webhooks/events/refund-paid

Occurs when a refund is successfully delivered to the customer.

Sent when a refund completes. Use it to mark your record refunded.

<ResponseExample>
  ```json Event theme={"dark"}
  {
    "id": "evt_1a2b3c4d5e6f7g8h",
    "type": "refund.paid",
    "created_at": "2026-04-27T12:00:00.000000+00:00",
    "organization_id": "org_abc123",
    "data": {
      "refund_id": "ref_1a2b3c4d5e",
      "charge_id": "chr_1a2b3c4d5e6f",
      "reference": "refund_9876",
      "status": "paid",
      "requested_amount": "10.00",
      "refunded_amount": "10.00",
      "refund_fee_amount": "0.00",
      "fee_bearer": "merchant",
      "reason": "Customer request"
    }
  }
  ```
</ResponseExample>

## Event fields

<ResponseField name="id" type="string">The event's unique identifier, prefixed `evt_`. Use it to deduplicate deliveries.</ResponseField>
<ResponseField name="type" type="string">Always `refund.paid`.</ResponseField>
<ResponseField name="created_at" type="string">When the event occurred, in UTC.</ResponseField>
<ResponseField name="organization_id" type="string">Your organization's ID.</ResponseField>

<ResponseField name="data.refund_id" type="string">The refund's ID.</ResponseField>
<ResponseField name="data.charge_id" type="string">The charge being refunded.</ResponseField>
<ResponseField name="data.reference" type="string | null">Your reference for the refund, or the one Bachs generated.</ResponseField>
<ResponseField name="data.status" type="string">Refund status, e.g. `processing`, `paid`, `failed`.</ResponseField>
<ResponseField name="data.requested_amount" type="string">The amount requested to refund, as a decimal string.</ResponseField>
<ResponseField name="data.refunded_amount" type="string | null">The amount actually refunded so far.</ResponseField>
<ResponseField name="data.refund_fee_amount" type="string">The fee charged on the refund, if any.</ResponseField>
<ResponseField name="data.fee_bearer" type="string">Who absorbs the refund fee, `customer` or `merchant`.</ResponseField>
<ResponseField name="data.reason" type="string | null">The reason for the refund, when provided.</ResponseField>


# Setting Up Webhooks

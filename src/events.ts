import { z } from 'zod'

import {
  CheckoutCompletedDataSchema,
  CheckoutExpiredDataSchema,
  CollectionFailedDataSchema,
  CollectionSucceededDataSchema,
  CollectionUnderpaidDataSchema,
  ConversionCompletedDataSchema,
  ConversionFailedDataSchema,
  CustomerCreatedDataSchema,
  CustomerSubscriptionCreatedDataSchema,
  CustomerSubscriptionDeletedDataSchema,
  CustomerSubscriptionUpdatedDataSchema,
  CustomerUpdatedDataSchema,
  DisputeCreatedDataSchema,
  DisputeUpdatedDataSchema,
  InvoiceCreatedDataSchema,
  InvoicePaidDataSchema,
  InvoicePaymentFailedDataSchema,
  PayoutCreatedDataSchema,
  PayoutFailedDataSchema,
  PayoutPaidDataSchema,
  RefundCreatedDataSchema,
  RefundFailedDataSchema,
  RefundPaidDataSchema,
} from './event_payloads.ts'

/**
 * The `data` schema for every event Bachs delivers.
 *
 * This registry is the single place the package decides what an event carries.
 * Adding an event means adding a schema here; the handler map, the payload
 * types and the parser all follow from it.
 */
export const EventDataSchemas = {
  'checkout.completed': CheckoutCompletedDataSchema,
  'checkout.expired': CheckoutExpiredDataSchema,
  'collection.succeeded': CollectionSucceededDataSchema,
  'collection.failed': CollectionFailedDataSchema,
  'collection.underpaid': CollectionUnderpaidDataSchema,
  'customer.created': CustomerCreatedDataSchema,
  'customer.updated': CustomerUpdatedDataSchema,
  'customer.subscription.created': CustomerSubscriptionCreatedDataSchema,
  'customer.subscription.updated': CustomerSubscriptionUpdatedDataSchema,
  'customer.subscription.deleted': CustomerSubscriptionDeletedDataSchema,
  'invoice.created': InvoiceCreatedDataSchema,
  'invoice.paid': InvoicePaidDataSchema,
  'invoice.payment_failed': InvoicePaymentFailedDataSchema,
  'payout.created': PayoutCreatedDataSchema,
  'payout.paid': PayoutPaidDataSchema,
  'payout.failed': PayoutFailedDataSchema,
  'refund.created': RefundCreatedDataSchema,
  'refund.paid': RefundPaidDataSchema,
  'refund.failed': RefundFailedDataSchema,
  'dispute.created': DisputeCreatedDataSchema,
  'dispute.updated': DisputeUpdatedDataSchema,
  'conversion.completed': ConversionCompletedDataSchema,
  'conversion.failed': ConversionFailedDataSchema,
} as const

/** Every event name Bachs can deliver. */
export type BachsEvent = keyof typeof EventDataSchemas

/** The `data` payload carried by each event. */
export type BachsEventPayloads = {
  [E in BachsEvent]: z.infer<(typeof EventDataSchemas)[E]>
}

/** The payload of any event, for a handler that takes them all. */
export type AnyBachsEventPayload = BachsEventPayloads[BachsEvent]

/** Every event name, as a value, for iteration and for building subscriptions. */
export const BACHS_EVENTS = Object.keys(EventDataSchemas) as ReadonlyArray<BachsEvent>

/** Recognises an event name this package knows how to parse. */
export function isBachsEvent(value: unknown): value is BachsEvent {
  return typeof value === 'string' && value in EventDataSchemas
}

/**
 * The fields wrapping every delivery, read before the event's own `data` is
 * parsed so an unknown event can still be identified and acknowledged.
 */
export const EventEnvelopeSchema = z.object({
  /** The event's unique identifier, prefixed `evt_`. Deliveries are deduplicated on it. */
  id: z.string(),
  /** The event name, e.g. `collection.succeeded`. */
  type: z.string(),
  /** When the event occurred, in UTC. */
  created_at: z.string().optional(),
  /** Your organization's ID. */
  organization_id: z.string().optional(),
  data: z.unknown(),
})

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>

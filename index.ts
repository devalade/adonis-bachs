export { Bachs } from './src/bachs.ts'
export { BachsClient, pageOf, PaginationSchema } from './src/client.ts'
export { defineConfig, resolveConfig } from './src/define_config.ts'
export { collect, MAX_PAGE_SIZE, paginate } from './src/pagination.ts'
export { redact, Redacted } from './src/redacted.ts'
export { MemoryDedupeStore, WebhooksReceiver } from './src/webhooks.ts'
export {
  BACHS_EVENTS,
  EventDataSchemas,
  EventEnvelopeSchema,
  isBachsEvent,
} from './src/events.ts'
export {
  BachsConflict,
  BachsForbidden,
  BachsNotFound,
  BachsPreconditionRequired,
  BachsRateLimited,
  BachsRequestFailed,
  BachsResponseUnexpected,
  BachsUnauthorized,
  BachsValidationFailed,
  isBachsFailure,
  toShapeIssues,
  WebhookPayloadUnexpected,
  WebhookSignatureInvalid,
} from './src/failures.ts'

export { configure } from './configure.ts'
export { stubsRoot } from './stubs/main.ts'

export type { WriteOptions } from './src/bachs.ts'
export type { Page, Pagination, QueryParams, RequestOptions } from './src/client.ts'
export type {
  BachsConfig,
  BachsEnvironment,
  Clock,
  ResolvedBachsConfig,
  WebhookDedupeStore,
} from './src/define_config.ts'
export type {
  AnyBachsEventPayload,
  BachsEvent,
  BachsEventPayloads,
  EventEnvelope,
} from './src/events.ts'
export type {
  BachsApiFailure,
  BachsErrorCode,
  BachsFailure,
  FieldError,
  ShapeIssue,
  WebhookFailure,
} from './src/failures.ts'
export type { WebhookDelivery, WebhookHandlers } from './src/webhooks.ts'
export type * from './src/schemas.ts'

import { test } from '@japa/runner'
import { Result } from 'better-result'
import { z } from 'zod'

import { BachsClient } from '../src/client.ts'
import { resolveConfig } from '../src/define_config.ts'
import {
  BachsConflict,
  BachsForbidden,
  BachsNotFound,
  BachsPreconditionRequired,
  BachsRateLimited,
  BachsRequestFailed,
  BachsResponseUnexpected,
  BachsUnauthorized,
  BachsValidationFailed,
} from '../src/failures.ts'
import { fakeFetch } from './helpers.ts'

const ObjectSchema = z.object({ id: z.string() })

function clientWith(responses: Parameters<typeof fakeFetch>[0], retries = 0) {
  const fetch = fakeFetch(responses)
  const client = new BachsClient(
    resolveConfig({ apiKey: 'sk_sandbox_key', fetch: fetch.impl, retries })
  )

  return { client, fetch }
}

test.group('BachsClient requests', () => {
  test('sends the API key as a bearer token', async ({ assert }) => {
    const { client, fetch } = clientWith([{ status: 200, body: { id: 'prod_1' } }])

    await client.get('/v1/products/prod_1', { operation: 'getProduct', schema: ObjectSchema })

    assert.equal(fetch.calls[0]?.headers['Authorization'], 'Bearer sk_sandbox_key')
    assert.equal(fetch.calls[0]?.headers['User-Agent'], 'adonis-bachs')
  })

  test('builds the URL against the environment base and drops absent query values', async ({
    assert,
  }) => {
    const { client, fetch } = clientWith([{ status: 200, body: { items: [], pagination: {} } }])

    await client.get('/v1/customers', {
      operation: 'listCustomers',
      schema: z.object({ items: z.array(z.unknown()), pagination: z.unknown() }),
      query: { limit: 20, search: undefined, cursor: null, status: 'active' },
    })

    const url = new URL(fetch.calls[0]!.url)
    assert.equal(url.origin, 'https://sandbox-api.bachs.io')
    assert.equal(url.pathname, '/v1/customers')
    assert.equal(url.searchParams.get('limit'), '20')
    assert.equal(url.searchParams.get('status'), 'active')
    assert.isFalse(url.searchParams.has('search'))
    assert.isFalse(url.searchParams.has('cursor'))
  })

  test('parses a flat object, with no envelope to unwrap', async ({ assert }) => {
    const { client } = clientWith([{ status: 200, body: { id: 'prod_1' } }])

    const result = await client.get('/v1/products/prod_1', {
      operation: 'getProduct',
      schema: ObjectSchema,
    })

    assert.isTrue(Result.isOk(result))
    assert.deepEqual(Result.isOk(result) ? result.value : null, { id: 'prod_1' })
  })

  test('reads a 204 as an empty body', async ({ assert }) => {
    const { client } = clientWith([{ status: 204 }])

    const result = await client.delete('/v1/product-groups/grp_1', {
      operation: 'deleteProductGroup',
      schema: z.null(),
    })

    assert.isTrue(Result.isOk(result))
  })

  test('fails loudly when the body does not match the documented shape', async ({ assert }) => {
    const { client } = clientWith([{ status: 200, body: { unexpected: true } }])

    const result = await client.get('/v1/products/prod_1', {
      operation: 'getProduct',
      schema: ObjectSchema,
    })

    assert.isTrue(Result.isError(result))
    const failure = Result.isError(result) ? result.error : null
    assert.instanceOf(failure, BachsResponseUnexpected)

    if (failure instanceof BachsResponseUnexpected) {
      assert.equal(failure.issues[0]?.path, 'id')
    }
  })

  test('surfaces a proxy HTML page as a failure rather than crashing', async ({ assert }) => {
    const { client } = clientWith([{ status: 502, text: '<html>bad gateway</html>' }])

    const result = await client.get('/v1/products', { operation: 'listProducts', schema: ObjectSchema })

    assert.isTrue(Result.isError(result))
    assert.instanceOf(Result.isError(result) ? result.error : null, BachsRequestFailed)
  })

  test('reports a network failure without a response', async ({ assert }) => {
    const { client } = clientWith([{ status: 0, throws: new Error('ECONNREFUSED') }])

    const result = await client.get('/v1/products', { operation: 'listProducts', schema: ObjectSchema })

    assert.isTrue(Result.isError(result))
    const failure = Result.isError(result) ? result.error : null
    assert.instanceOf(failure, BachsRequestFailed)
    assert.include(failure?.message ?? '', 'ECONNREFUSED')
  })
})

test.group('BachsClient idempotency', () => {
  test('sends an Idempotency-Key on every write', async ({ assert }) => {
    const { client, fetch } = clientWith([{ status: 201, body: { id: 'chk_1' } }])

    await client.post('/v1/checkout-sessions', {
      operation: 'createCheckoutSession',
      schema: ObjectSchema,
      body: { a: 1 },
    })

    assert.isString(fetch.calls[0]?.headers['Idempotency-Key'])
  })

  test('uses the caller key when one is given', async ({ assert }) => {
    const { client, fetch } = clientWith([{ status: 201, body: { id: 'chk_1' } }])

    await client.post('/v1/checkout-sessions', {
      operation: 'createCheckoutSession',
      schema: ObjectSchema,
      body: { a: 1 },
      idempotencyKey: 'order_ORD-12345',
    })

    assert.equal(fetch.calls[0]?.headers['Idempotency-Key'], 'order_ORD-12345')
  })

  test('reuses one key across a write retry, so a retry cannot charge twice', async ({ assert }) => {
    const { client, fetch } = clientWith(
      [
        { status: 500, body: { detail: 'boom', error_code: 'INTERNAL_SERVER_ERROR' } },
        { status: 201, body: { id: 'chk_1' } },
      ],
      2
    )

    const result = await client.post('/v1/checkout-sessions', {
      operation: 'createCheckoutSession',
      schema: ObjectSchema,
      body: { a: 1 },
    })

    assert.isTrue(Result.isOk(result))
    assert.lengthOf(fetch.calls, 2)
    assert.equal(
      fetch.calls[0]?.headers['Idempotency-Key'],
      fetch.calls[1]?.headers['Idempotency-Key']
    )
  })

  test('does not send an Idempotency-Key on a read', async ({ assert }) => {
    const { client, fetch } = clientWith([{ status: 200, body: { id: 'prod_1' } }])

    await client.get('/v1/products/prod_1', { operation: 'getProduct', schema: ObjectSchema })

    assert.isUndefined(fetch.calls[0]?.headers['Idempotency-Key'])
  })
})

test.group('BachsClient retries', () => {
  test('retries a 429 and then succeeds', async ({ assert }) => {
    const { client, fetch } = clientWith(
      [
        { status: 429, body: { detail: 'slow down', error_code: 'TOO_MANY_REQUESTS' }, headers: { 'retry-after': '0' } },
        { status: 200, body: { id: 'prod_1' } },
      ],
      2
    )

    const result = await client.get('/v1/products/prod_1', {
      operation: 'getProduct',
      schema: ObjectSchema,
    })

    assert.isTrue(Result.isOk(result))
    assert.lengthOf(fetch.calls, 2)
  })

  test('gives up after the configured attempts and reports the rate limit', async ({ assert }) => {
    const { client, fetch } = clientWith(
      [
        {
          status: 429,
          body: { detail: 'slow down', error_code: 'TOO_MANY_REQUESTS' },
          headers: { 'retry-after': '0', 'x-ratelimit-reset': '1783976340' },
        },
      ],
      1
    )

    const result = await client.get('/v1/products', { operation: 'listProducts', schema: ObjectSchema })

    assert.lengthOf(fetch.calls, 2)
    const failure = Result.isError(result) ? result.error : null
    assert.instanceOf(failure, BachsRateLimited)
    assert.equal((failure as BachsRateLimited).retryAfter, 0)
    assert.equal((failure as BachsRateLimited).resetAt, 1783976340)
  })

  test('does not retry a 4xx that a retry cannot fix', async ({ assert }) => {
    const { client, fetch } = clientWith(
      [{ status: 404, body: { detail: 'Product not found', error_code: 'NOT_FOUND' } }],
      2
    )

    await client.get('/v1/products/nope', { operation: 'getProduct', schema: ObjectSchema })

    assert.lengthOf(fetch.calls, 1)
  })
})

test.group('BachsClient failure mapping', () => {
  const cases = [
    { status: 401, code: 'UNAUTHORIZED', type: BachsUnauthorized },
    { status: 403, code: 'FORBIDDEN', type: BachsForbidden },
    { status: 404, code: 'NOT_FOUND', type: BachsNotFound },
    { status: 409, code: 'IDEMPOTENCY_CONFLICT', type: BachsConflict },
    { status: 422, code: 'VALIDATION_ERROR', type: BachsValidationFailed },
    { status: 428, code: 'TOTP_STEP_UP_REQUIRED', type: BachsPreconditionRequired },
  ] as const

  for (const testCase of cases) {
    test(`maps ${testCase.status} to its own failure`, async ({ assert }) => {
      const { client } = clientWith([
        {
          status: testCase.status,
          body: { detail: 'nope', error_code: testCase.code, doc_url: 'https://docs.bachs.io/x' },
          headers: { 'x-request-id': 'req_123' },
        },
      ])

      const result = await client.get('/v1/products', {
        operation: 'listProducts',
        schema: ObjectSchema,
      })

      const failure = Result.isError(result) ? result.error : null
      assert.instanceOf(failure, testCase.type)
      assert.equal((failure as { errorCode?: string }).errorCode, testCase.code)
      assert.equal((failure as { requestId?: string }).requestId, 'req_123')
      assert.equal((failure as { detail?: string }).detail, 'nope')
      assert.equal((failure as { docUrl?: string }).docUrl, 'https://docs.bachs.io/x')
    })
  }

  test('carries field errors off a validation failure', async ({ assert }) => {
    const { client } = clientWith([
      {
        status: 422,
        body: {
          detail: 'Missing required field(s): name, price',
          error_code: 'VALIDATION_ERROR',
          errors: [
            { field: 'name', message: 'Field required', type: 'missing' },
            { field: 'price', message: 'Field required', type: 'missing' },
          ],
        },
      },
    ])

    const result = await client.post('/v1/products', {
      operation: 'createProduct',
      schema: ObjectSchema,
      body: {},
    })

    const failure = Result.isError(result) ? result.error : null
    assert.instanceOf(failure, BachsValidationFailed)
    assert.deepEqual(
      (failure as BachsValidationFailed).errors.map((error) => error.field),
      ['name', 'price']
    )
  })

  test('keeps the API key out of a thrown failure', async ({ assert }) => {
    const { client } = clientWith([{ status: 401, body: { detail: 'Invalid API key', error_code: 'UNAUTHORIZED' } }])

    const result = await client.get('/v1/products', { operation: 'listProducts', schema: ObjectSchema })
    const failure = Result.isError(result) ? result.error : null

    assert.notInclude(JSON.stringify(failure), 'sk_sandbox_key')
  })
})

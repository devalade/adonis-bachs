import { test } from '@japa/runner'
import { isTaggedError, matchErrorPartial } from 'better-result'

import {
  BachsRateLimited,
  BachsUnauthorized,
  BachsValidationFailed,
  isBachsFailure,
} from '../src/failures.ts'

function validationFailure() {
  return new BachsValidationFailed({
    operation: 'createProduct',
    errorCode: 'VALIDATION_ERROR',
    requestId: 'req_1',
    detail: 'Missing required field(s): name',
    docUrl: 'https://docs.bachs.io/api-reference/error-reference#general',
    errors: [{ field: 'name', message: 'Field required', type: 'missing' }],
    details: null,
    message: 'Missing required field(s): name',
  })
}

function rateLimitFailure() {
  return new BachsRateLimited({
    operation: 'listProducts',
    errorCode: 'TOO_MANY_REQUESTS',
    requestId: 'req_2',
    detail: 'slow down',
    docUrl: null,
    retryAfter: 5,
    resetAt: 1783976340,
    message: 'slow down',
  })
}

test.group('failure guards', () => {
  test('.is narrows to the concrete failure', ({ assert }) => {
    const error: unknown = validationFailure()

    assert.isTrue(BachsValidationFailed.is(error))

    if (BachsValidationFailed.is(error)) {
      // Narrowed: `errors` only exists on this failure.
      assert.equal(error.errors[0]?.field, 'name')
      assert.equal(error.errorCode, 'VALIDATION_ERROR')
      assert.equal(error.requestId, 'req_1')
    }
  })

  test('.is rejects a different failure', ({ assert }) => {
    assert.isFalse(BachsRateLimited.is(validationFailure()))
    assert.isFalse(BachsValidationFailed.is(new Error('unrelated')))
  })

  test('.is agrees with instanceof, which is what it is built on', ({ assert }) => {
    const error = validationFailure()

    assert.equal(BachsValidationFailed.is(error), error instanceof BachsValidationFailed)
    assert.equal(BachsRateLimited.is(error), error instanceof BachsRateLimited)
  })

  test('every failure is a tagged error carrying its own tag', ({ assert }) => {
    assert.isTrue(isTaggedError(validationFailure()))
    assert.equal(validationFailure()._tag, 'BachsValidationFailed')
    assert.equal(rateLimitFailure()._tag, 'BachsRateLimited')
  })

  test('isBachsFailure recognises this package failures among caught values', ({ assert }) => {
    assert.isTrue(isBachsFailure(validationFailure()))
    assert.isTrue(isBachsFailure(rateLimitFailure()))
    assert.isFalse(isBachsFailure(new Error('unrelated')))
    assert.isFalse(isBachsFailure(null))
  })
})

test.group('matching on the tag', () => {
  /** The shape the README documents, kept here so the README cannot drift from it. */
  function toResponse(error: unknown) {
    if (!isBachsFailure(error)) {
      return null
    }

    return matchErrorPartial(
      error,
      {
        BachsValidationFailed: (failure) => ({ status: 422, errors: failure.errors }),
        BachsRateLimited: (failure) => ({ status: 429, retryAfter: failure.retryAfter }),
        BachsUnauthorized: () => ({ status: 401, message: 'Check BACHS_API_KEY' }),
      },
      () => null
    )
  }

  test('routes each failure to its own handler', ({ assert }) => {
    assert.deepInclude(toResponse(validationFailure()), { status: 422 })
    assert.deepInclude(toResponse(rateLimitFailure()), { status: 429, retryAfter: 5 })
  })

  test('sends an unnamed failure to the fallback', ({ assert }) => {
    const unauthorized = new BachsUnauthorized({
      operation: 'listProducts',
      errorCode: 'UNAUTHORIZED',
      requestId: null,
      detail: 'Invalid API key',
      docUrl: null,
      message: 'Invalid API key',
    })

    assert.deepInclude(toResponse(unauthorized), { status: 401 })
    assert.isNull(toResponse(new Error('unrelated')))
  })
})

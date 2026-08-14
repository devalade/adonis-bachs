import { test } from '@japa/runner'

import { CreateCheckoutSessionResponseSchema } from '../src/schemas.ts'

test.group('Generated enums', () => {
  test('reads a checkout status in the case the API sends, not the case the spec documents', ({
    assert,
  }) => {
    const parsed = CreateCheckoutSessionResponseSchema.parse({
      checkout_id: 'chk_1',
      checkout_url: 'https://sandbox-checkout.bachs.io/c/1',
      status: 'open',
    })

    assert.equal(parsed.status, 'OPEN')
  })

  test('still rejects a status that is not a documented state', ({ assert }) => {
    assert.throws(() => CreateCheckoutSessionResponseSchema.parse({ status: 'refunded' }))
  })
})

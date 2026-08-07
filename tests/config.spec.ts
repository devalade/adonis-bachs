import { test } from '@japa/runner'

import { resolveConfig } from '../src/define_config.ts'
import { redact, Redacted } from '../src/redacted.ts'

test.group('resolveConfig', () => {
  test('infers the sandbox from a sandbox key', ({ assert }) => {
    const config = resolveConfig({ apiKey: 'sk_sandbox_abc' })

    assert.equal(config.environment, 'sandbox')
    assert.equal(config.baseUrl, 'https://sandbox-api.bachs.io')
  })

  test('infers production from a live key', ({ assert }) => {
    const config = resolveConfig({ apiKey: 'sk_live_abc' })

    assert.equal(config.environment, 'production')
    assert.equal(config.baseUrl, 'https://api.bachs.io')
  })

  test('refuses a key that contradicts the stated environment', ({ assert }) => {
    assert.throws(
      () => resolveConfig({ apiKey: 'sk_sandbox_abc', environment: 'production' }),
      /environment mismatch/
    )
  })

  test('refuses a key whose environment cannot be told', ({ assert }) => {
    assert.throws(() => resolveConfig({ apiKey: 'nonsense' }), /Cannot tell which Bachs environment/)
  })

  test('accepts an unknown prefix when the environment is stated', ({ assert }) => {
    const config = resolveConfig({ apiKey: 'proxy_key', environment: 'sandbox' })

    assert.equal(config.environment, 'sandbox')
  })

  test('refuses an empty key', ({ assert }) => {
    assert.throws(() => resolveConfig({ apiKey: '' }), /Missing Bachs API key/)
  })

  test('trims a trailing slash off an overridden base URL', ({ assert }) => {
    const config = resolveConfig({ apiKey: 'sk_sandbox_abc', baseUrl: 'http://localhost:8080/' })

    assert.equal(config.baseUrl, 'http://localhost:8080')
  })

  test('normalises one webhook secret into the rotation list', ({ assert }) => {
    const config = resolveConfig({ apiKey: 'sk_sandbox_abc', webhookSecret: 'whsec_one' })

    assert.lengthOf(config.webhookSecrets, 1)
    assert.equal(config.webhookSecrets[0]?.reveal(), 'whsec_one')
  })

  test('keeps every secret when several are configured for a rotation', ({ assert }) => {
    const config = resolveConfig({
      apiKey: 'sk_sandbox_abc',
      webhookSecret: ['whsec_new', redact('whsec_old')],
    })

    assert.deepEqual(
      config.webhookSecrets.map((secret) => secret.reveal()),
      ['whsec_new', 'whsec_old']
    )
  })

  test('drops empty secrets rather than trusting them', ({ assert }) => {
    const config = resolveConfig({ apiKey: 'sk_sandbox_abc', webhookSecret: '' })

    assert.lengthOf(config.webhookSecrets, 0)
  })
})

test.group('Redacted', () => {
  test('keeps the secret out of logs and serialisation', ({ assert }) => {
    const secret = redact('sk_live_super_secret')

    assert.equal(String(secret), '<redacted>')
    assert.equal(JSON.stringify({ key: secret }), '{"key":"<redacted>"}')
    assert.notInclude(JSON.stringify({ key: secret }), 'super_secret')
    assert.equal(secret.reveal(), 'sk_live_super_secret')
  })

  test('does not double-wrap', ({ assert }) => {
    const once = redact('value')

    assert.strictEqual(redact(once), once)
    assert.instanceOf(once, Redacted)
  })

  test('keeps the API key out of a serialised config', ({ assert }) => {
    const config = resolveConfig({ apiKey: 'sk_live_do_not_leak' })

    assert.notInclude(JSON.stringify(config), 'do_not_leak')
  })
})

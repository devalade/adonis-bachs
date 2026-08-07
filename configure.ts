import type Configure from '@adonisjs/core/commands/configure'

import { stubsRoot } from './stubs/main.ts'

/**
 * Runs on `node ace configure @devalade/adonis-bachs`.
 */
export async function configure(command: Configure) {
  const codemods = await command.createCodemods()

  /**
   * config/bachs.ts
   */
  await codemods.makeUsingStub(stubsRoot, 'config/bachs.stub', {})

  /**
   * app/controllers/bachs_webhooks_controller.ts — the webhook receiver.
   */
  await codemods.makeUsingStub(stubsRoot, 'controllers/bachs_webhooks_controller.stub', {})

  /**
   * Environment variables.
   */
  await codemods.defineEnvValidations({
    variables: {
      BACHS_API_KEY: 'Env.schema.string()',
      BACHS_WEBHOOK_SECRET: 'Env.schema.string.optional()',
    },
    leadingComment: 'Variables for @devalade/adonis-bachs',
  })

  /**
   * Provider and command registration.
   */
  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@devalade/adonis-bachs/bachs_provider')
    rcFile.addCommand('@devalade/adonis-bachs/commands')
  })

  command.logger.log('')
  command.logger.info('Next steps:')
  command.logger.log('  1. Add BACHS_API_KEY to your .env — start with your sk_sandbox_ key')
  command.logger.log('  2. Run "node ace bachs:check" to confirm the key works')
  command.logger.log(
    '  3. Point a webhook endpoint at POST /webhooks/bachs and copy its signing secret into BACHS_WEBHOOK_SECRET'
  )
  command.logger.log(
    '  4. Register the route without CSRF: router.post("/webhooks/bachs", [BachsWebhooksController])'
  )
}

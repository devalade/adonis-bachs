import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

import { BachsForbidden, BachsUnauthorized } from '../src/failures.ts'

/**
 * Confirms the configured API key reaches the right organization, and says
 * loudly which environment it is pointed at.
 */
export default class BachsCheck extends BaseCommand {
  static commandName = 'bachs:check'
  static description = 'Verify the Bachs API key and print the connected organization'
  static options: CommandOptions = { startApp: true }

  async run() {
    const bachs = await this.app.container.make('bachs')

    this.logger.info(`Environment: ${bachs.environment}`)

    try {
      const organization = await bachs.organizations.me()
      const products = await bachs.products.list({ limit: 1 })

      const name =
        typeof organization === 'object' && organization !== null && 'name' in organization
          ? String((organization as { name?: unknown }).name ?? 'your organization')
          : 'your organization'

      this.logger.success(`Connected to ${name}`)
      this.logger.info(
        products.items.length > 0
          ? `Products are readable, first one: ${products.items[0]?.name ?? '(unnamed)'}`
          : 'No products in the catalogue yet'
      )

      if (bachs.environment === 'production') {
        this.logger.warning('This key is live. Calls from this app move real money.')
      }
    } catch (error) {
      if (BachsUnauthorized.is(error)) {
        this.logger.error('Bachs rejected the API key.')
        this.logger.info(
          'Check BACHS_API_KEY in your .env. A sandbox key cannot talk to production, or the other way round.'
        )
        this.exitCode = 1
        return
      }

      if (BachsForbidden.is(error)) {
        this.logger.error('The API key is valid but lacks a scope this check needs.')
        this.logger.info('Grant it the read scopes in the developer portal under API Keys.')
        this.exitCode = 1
        return
      }

      throw error
    }
  }
}

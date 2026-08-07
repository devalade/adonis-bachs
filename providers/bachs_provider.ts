import type { ApplicationService } from '@adonisjs/core/types'

import { Bachs } from '../src/bachs.ts'
import type { BachsConfig } from '../src/define_config.ts'

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    bachs: Bachs
  }
}

/**
 * Registers a single Bachs instance, built from `config/bachs.ts`.
 */
export default class BachsProvider {
  constructor(protected app: ApplicationService) {}

  register(): void {
    this.app.container.singleton('bachs', async () => {
      const config = this.app.config.get<BachsConfig>('bachs')
      return new Bachs(config)
    })
  }
}

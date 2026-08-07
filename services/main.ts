import app from '@adonisjs/core/services/app'
import type { Bachs } from '../src/bachs.ts'

let bachs: Bachs

/**
 * Returns the Bachs instance from the container, so an app can
 * `import bachs from '@devalade/adonis-bachs/services/main'`.
 */
await app.booted(async () => {
  bachs = await app.container.make('bachs')
})

export { bachs as default }

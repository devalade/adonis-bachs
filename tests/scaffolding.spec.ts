import { readdir, readFile } from 'node:fs/promises'
import type Configure from '@adonisjs/core/commands/configure'
import { test } from '@japa/runner'
import { compile } from 'tempura'

import { configure } from '../configure.ts'

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

/** Every `.stub` under `stubs/`, as paths relative to the package root. */
async function everyStub(): Promise<string[]> {
  const root = new URL('../stubs/', import.meta.url)
  const entries = await readdir(root, { recursive: true, withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.stub'))
    .map((entry) => `stubs/${entry.parentPath.split('/stubs/')[1] ?? ''}/${entry.name}`)
    .map((path) => path.replace('//', '/'))
}

test.group('stub compilation', () => {
  /**
   * The stub engine embeds a stub's body in a JavaScript template literal, so
   * an unescaped backtick in prose closes the literal and whatever follows is
   * parsed as code. That ships as a `configure` crash, not a failing test,
   * because the earlier scaffolding tests fake `makeUsingStub` and only ever
   * read the stubs as strings.
   *
   * Compiling every stub here is the cheapest thing that would have caught it.
   */
  test('every stub compiles', async ({ assert }) => {
    const stubs = await everyStub()
    assert.isAbove(stubs.length, 0, 'expected to find stubs to compile')

    for (const path of stubs) {
      const contents = await source(path)

      try {
        compile(contents)
      } catch (error) {
        assert.fail(
          `${path} does not compile: ${(error as Error).message}. ` +
            'Escape backticks and "${" in stub prose — the body becomes a template literal.'
        )
      }
    }
  })

  test('stub prose escapes backticks', async ({ assert }) => {
    for (const path of await everyStub()) {
      const contents = await source(path)

      /**
       * Only the body is checked. A `{{{ … }}}` header is raw JavaScript, where
       * a template literal is legitimate — the migration stub builds its
       * filename with one.
       */
      const body = contents.replace(/^\{\{\{[\s\S]*?\}\}\}/, '')
      const unescaped = body.match(/(?<!\\)`/g) ?? []

      assert.lengthOf(unescaped, 0, `${path} has ${unescaped.length} unescaped backtick(s)`)
    }
  })
})

test.group('durable webhook scaffolding', () => {
  test('generates durable files only when the Lucid inbox is accepted', async ({ assert }) => {
    async function generatedStubs(useLucidInbox: boolean) {
      const stubs: string[] = []
      const codemods = {
        async makeUsingStub(_root: string, path: string) {
          stubs.push(path)
        },
        async defineEnvValidations() {},
        async updateRcFile(update: (rcFile: object) => void) {
          update({ addProvider() {}, addCommand() {} })
        },
      }
      const command = {
        async createCodemods() {
          return codemods
        },
        prompt: { async confirm() { return useLucidInbox } },
        logger: { log() {}, info() {} },
      }

      // SAFETY: The configure function uses only the command members supplied by this
      // real-seam fake. TypeScript's framework command class also contains unrelated internals.
      await configure(command as unknown as Configure)
      return stubs
    }

    const regular = await generatedStubs(false)
    const durable = await generatedStubs(true)

    assert.include(regular, 'config/bachs.stub')
    assert.notInclude(regular, 'services/bachs_webhook_store.stub')
    assert.include(durable, 'config/bachs_lucid.stub')
    assert.include(durable, 'services/bachs_webhook_store.stub')
    assert.include(durable, 'migrations/create_bachs_webhook_events_table.stub')
  })

  test('wires the generated store only in the Lucid config', async ({ assert }) => {
    const regular = await source('stubs/config/bachs.stub')
    const lucid = await source('stubs/config/bachs_lucid.stub')

    assert.notInclude(regular, 'BachsWebhookStore')
    assert.include(lucid, "import BachsWebhookStore from '#services/bachs_webhook_store'")
    assert.include(lucid, 'dedupe: new BachsWebhookStore()')
  })

  test('generates a durable event inbox with lease and retention indexes', async ({ assert }) => {
    const migration = await source('stubs/migrations/create_bachs_webhook_events_table.stub')

    for (const column of [
      'event_id',
      'event_type',
      'organization_id',
      'occurred_at',
      'payload',
      'status',
      'attempts',
      'claim_token',
      'claimed_until',
      'expires_at',
      'processed_at',
    ]) {
      assert.include(migration, `'${column}'`)
    }
    assert.include(migration, "table.string('event_id').notNullable().unique()")
    assert.include(migration, "table.index(['status', 'claimed_until'])")
    assert.include(migration, "table.index(['status', 'expires_at'])")
  })

  test('scopes completion and release to the owning claim token', async ({ assert }) => {
    const store = await source('stubs/services/bachs_webhook_store.stub')

    assert.include(store, "import { randomUUID } from 'node:crypto'")
    assert.include(store, "claim_token: token")
    assert.include(store, "status: 'processing'")
    assert.include(store, ".onConflict('event_id')")
    assert.include(store, "where('claimed_until', '<=', now)")
    assert.include(store, "where('expires_at', '<=', now)")
    assert.include(store, "orWhere('status', 'failed')")
    assert.include(store, "attempts: db.raw('attempts + 1')")
    assert.include(store, "status: 'failed'")
    assert.include(store, "where({ event_id: eventId, status: 'processing', claim_token: token })")
  })

  test('does not make Lucid a dependency of the package', async ({ assert }) => {
    const manifest = JSON.parse(await source('package.json')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }

    assert.notProperty(manifest.dependencies ?? {}, '@adonisjs/lucid')
    assert.notProperty(manifest.peerDependencies ?? {}, '@adonisjs/lucid')
  })
})

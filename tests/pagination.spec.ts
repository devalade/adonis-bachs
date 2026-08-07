import { test } from '@japa/runner'
import { z } from 'zod'

import { BachsClient } from '../src/client.ts'
import { resolveConfig } from '../src/define_config.ts'
import { collect, paginate } from '../src/pagination.ts'
import { fakeFetch } from './helpers.ts'

const ItemSchema = z.object({ id: z.string() })

function clientWith(responses: Parameters<typeof fakeFetch>[0]) {
  const fetch = fakeFetch(responses)
  return {
    client: new BachsClient(resolveConfig({ apiKey: 'sk_sandbox_key', fetch: fetch.impl })),
    fetch,
  }
}

test.group('paginate', () => {
  test('follows next_cursor to the end', async ({ assert }) => {
    const { client, fetch } = clientWith([
      {
        status: 200,
        body: {
          items: [{ id: 'a' }, { id: 'b' }],
          pagination: { next_cursor: 'cur_2', has_more: true },
        },
      },
      {
        status: 200,
        body: { items: [{ id: 'c' }], pagination: { next_cursor: null, has_more: false } },
      },
    ])

    const items = await collect(paginate(client, '/v1/products', 'listProducts', ItemSchema))

    assert.deepEqual(
      items.map((item) => item.id),
      ['a', 'b', 'c']
    )
    assert.equal(new URL(fetch.calls[1]!.url).searchParams.get('cursor'), 'cur_2')
  })

  test('falls back to offset paging when no cursor is offered', async ({ assert }) => {
    const { client, fetch } = clientWith([
      { status: 200, body: { items: [{ id: 'a' }, { id: 'b' }], pagination: { total: 3 } } },
      { status: 200, body: { items: [{ id: 'c' }], pagination: { total: 3 } } },
    ])

    const items = await collect(paginate(client, '/v1/customers', 'listCustomers', ItemSchema))

    assert.deepEqual(
      items.map((item) => item.id),
      ['a', 'b', 'c']
    )
    assert.equal(new URL(fetch.calls[0]!.url).searchParams.get('offset'), '0')
    assert.equal(new URL(fetch.calls[1]!.url).searchParams.get('offset'), '2')
  })

  test('stops on an empty page rather than looping on a repeated cursor', async ({ assert }) => {
    const { client, fetch } = clientWith([
      {
        status: 200,
        body: { items: [{ id: 'a' }], pagination: { next_cursor: 'stuck', has_more: true } },
      },
      { status: 200, body: { items: [], pagination: { next_cursor: 'stuck', has_more: true } } },
    ])

    const items = await collect(paginate(client, '/v1/products', 'listProducts', ItemSchema))

    assert.lengthOf(items, 1)
    assert.lengthOf(fetch.calls, 2)
  })

  test('stops when has_more turns false even with a cursor present', async ({ assert }) => {
    const { client, fetch } = clientWith([
      {
        status: 200,
        body: { items: [{ id: 'a' }], pagination: { next_cursor: 'cur_2', has_more: false } },
      },
    ])

    const items = await collect(paginate(client, '/v1/products', 'listProducts', ItemSchema))

    assert.lengthOf(items, 1)
    assert.lengthOf(fetch.calls, 1)
  })

  test('throws when a page fails, rather than ending the walk quietly', async ({ assert }) => {
    const { client } = clientWith([
      {
        status: 200,
        body: { items: [{ id: 'a' }], pagination: { next_cursor: 'cur_2', has_more: true } },
      },
      { status: 500, body: { detail: 'boom', error_code: 'INTERNAL_SERVER_ERROR' } },
    ])

    await assert.rejects(async () =>
      collect(paginate(client, '/v1/products', 'listProducts', ItemSchema))
    )
  })

  test('carries the caller filters onto every page', async ({ assert }) => {
    const { client, fetch } = clientWith([
      { status: 200, body: { items: [{ id: 'a' }], pagination: { has_more: false } } },
    ])

    await collect(
      paginate(client, '/v1/customers', 'listCustomers', ItemSchema, { search: 'ada' })
    )

    assert.equal(new URL(fetch.calls[0]!.url).searchParams.get('search'), 'ada')
  })
})

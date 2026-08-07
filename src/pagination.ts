import { Result } from 'better-result'
import type { z } from 'zod'

import { pageOf, type BachsClient, type Page, type QueryParams } from './client.ts'
import type { BachsApiFailure } from './failures.ts'

/** The largest page Bachs serves. Larger values are clamped, not rejected. */
export const MAX_PAGE_SIZE = 100

/**
 * Walks every page of a list endpoint, yielding one item at a time.
 *
 * Bachs pages some collections by cursor and others by offset, so this follows
 * `next_cursor` when one is offered and counts records forward when it is not.
 * Paging stops when `has_more` turns false, when a page comes back empty, or
 * when neither a cursor nor a record count is left to advance — a walk that
 * cannot make progress ends rather than spinning.
 *
 * A page that fails throws, so a `for await` loop does not silently end early
 * on a rate limit and leave a caller believing it saw everything.
 *
 * @template S - The schema for one item.
 * @throws {Error} A {@link BachsApiFailure} when a page fails to load.
 */
export async function* paginate<S extends z.ZodType>(
  client: BachsClient,
  path: string,
  operation: string,
  item: S,
  params: QueryParams = {}
): AsyncGenerator<z.infer<S>, void, undefined> {
  const schema = pageOf(item)
  let cursor: string | null = null
  let offset = 0
  let seen = 0

  while (true) {
    const query: QueryParams = {
      limit: MAX_PAGE_SIZE,
      ...params,
      ...(cursor === null ? { offset } : { cursor }),
    }

    const result: Result<Page<z.infer<S>>, BachsApiFailure> = await client.get(path, {
      operation,
      schema,
      query,
    })

    if (Result.isError(result)) {
      throw result.error
    }

    const page = result.value

    for (const entry of page.items) {
      yield entry
    }

    seen += page.items.length

    if (page.items.length === 0 || page.pagination.has_more === false) {
      return
    }

    const next = page.pagination.next_cursor ?? null
    if (next !== null) {
      cursor = next
      continue
    }

    /**
     * No cursor: fall back to offset paging. `total` is the only signal that
     * an offset-paged collection is exhausted when `has_more` is absent.
     */
    const total = page.pagination.total
    if (total !== undefined && seen >= total) {
      return
    }

    offset = seen
  }
}

/**
 * Collects every page into one array.
 *
 * Prefer {@link paginate} in a request handler: this holds the whole
 * collection in memory, which is fine for a report and wrong for a catalogue
 * that grows.
 *
 * @template T - The item type.
 * @throws {Error} A {@link BachsApiFailure} when a page fails to load.
 */
export async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []

  for await (const item of source) {
    items.push(item)
  }

  return items
}

/**
 * Generates `src/schemas.ts` from the vendored OpenAPI document.
 *
 * Transcribing 110 schemas by hand invites drift and typos in exactly the
 * place they hurt most — the shape of a payment. Deriving them mechanically
 * keeps the package honest: re-run this after replacing
 * `resources/openapi.json` and review the diff.
 *
 *   npm run generate:schemas
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

type JsonSchema = {
  $ref?: string
  type?: string
  format?: string
  enum?: unknown[]
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  nullable?: boolean
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  allOf?: JsonSchema[]
  additionalProperties?: boolean | JsonSchema
  description?: string
  deprecated?: boolean
}

type OpenApi = {
  components: { schemas: Record<string, JsonSchema> }
  paths: Record<string, Record<string, Operation>>
}

type Operation = {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: Parameter[]
}

type Parameter = {
  name: string
  in: string
  required?: boolean
  description?: string
  schema?: JsonSchema
}

const spec = JSON.parse(readFileSync(join(root, 'resources/openapi.json'), 'utf8')) as OpenApi
const schemas = spec.components.schemas

/** Turns a `$ref` into the component name it points at. */
function refName(ref: string): string {
  const name = ref.split('/').pop()
  if (name === undefined) {
    throw new Error(`Unresolvable $ref: ${ref}`)
  }
  return name
}

/** The exported const for a component, e.g. `Customer` -> `CustomerSchema`. */
function constName(name: string): string {
  return `${name}Schema`
}

/**
 * Collapses a description into a single-line JSDoc body. Examples in the spec
 * run to paragraphs; the first two sentences carry the meaning.
 */
function jsdoc(description: string | undefined, indent: string): string {
  if (description === undefined || description.trim() === '') {
    return ''
  }

  const text = description.replace(/\s+/g, ' ').trim()
  const clipped = text.length > 400 ? `${text.slice(0, 397)}...` : text

  const width = 92 - indent.length
  const words = clipped.split(' ')
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    if (line === '') {
      line = word
    } else if (`${line} ${word}`.length <= width) {
      line = `${line} ${word}`
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line !== '') {
    lines.push(line)
  }

  if (lines.length === 1) {
    return `${indent}/** ${lines[0]} */\n`
  }

  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join('\n')}\n${indent} */\n`
}

/** Escapes a string for a single-quoted TypeScript literal. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** Property keys that are not plain identifiers must be quoted in an object literal. */
function propertyKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quote(key)
}

/**
 * A oneOf branch that carries nothing but `required` does not describe a
 * variant shape — it constrains which keys the base object must carry. The
 * checkout request uses this to say "product_cart or pricing, not both".
 */
function isRequiredOnlyBranch(branch: JsonSchema): boolean {
  return (
    Array.isArray(branch.required) &&
    branch.$ref === undefined &&
    branch.properties === undefined &&
    branch.type === undefined &&
    branch.oneOf === undefined
  )
}

/** Renders a JSON Schema as Zod source. */
function toZod(schema: JsonSchema, indent: string): string {
  const base = toZodBase(schema, indent)
  return schema.nullable === true ? `${base}.nullable()` : base
}

function toZodBase(schema: JsonSchema, indent: string): string {
  if (schema.$ref !== undefined) {
    return constName(refName(schema.$ref))
  }

  const variants = schema.oneOf ?? schema.anyOf
  if (variants !== undefined && !variants.every(isRequiredOnlyBranch)) {
    const rendered = variants.map((variant) => toZod(variant, indent))
    return `z.union([${rendered.join(', ')}])`
  }

  if (schema.allOf !== undefined) {
    return schema.allOf
      .map((part) => toZod(part, indent))
      .reduce((left, right) => `z.intersection(${left}, ${right})`)
  }

  if (schema.enum !== undefined) {
    const values = schema.enum
    if (values.every((value) => typeof value === 'string')) {
      return `caseInsensitiveEnum([${values.map((value) => quote(value as string)).join(', ')}])`
    }
    return `z.union([${values.map((value) => `z.literal(${JSON.stringify(value)})`).join(', ')}])`
  }

  if (schema.type === 'array') {
    return `z.array(${schema.items === undefined ? 'z.unknown()' : toZod(schema.items, indent)})`
  }

  if (schema.properties !== undefined) {
    return renderObject(schema, indent)
  }

  if (schema.type === 'object') {
    const additional = schema.additionalProperties
    if (additional !== undefined && additional !== false && typeof additional === 'object') {
      return `z.record(z.string(), ${toZod(additional, indent)})`
    }
    return `z.record(z.string(), z.unknown())`
  }

  switch (schema.type) {
    case 'string':
      return 'z.string()'
    case 'integer':
      return 'z.number().int()'
    case 'number':
      return 'z.number()'
    case 'boolean':
      return 'z.boolean()'
    default:
      return 'z.unknown()'
  }
}

function renderObject(schema: JsonSchema, indent: string): string {
  const inner = `${indent}  `
  const required = new Set(schema.required ?? [])
  const entries: string[] = []

  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const doc = jsdoc(
      property.deprecated === true ? `@deprecated ${property.description ?? ''}` : property.description,
      inner
    )
    const value = toZod(property, inner)
    const suffix = required.has(key) ? '' : '.optional()'
    entries.push(`${doc}${inner}${propertyKey(key)}: ${value}${suffix},`)
  }

  const body = entries.length === 0 ? '' : `\n${entries.join('\n')}\n${indent}`
  const object = `z.object({${body}})`

  const variants = schema.oneOf ?? schema.anyOf
  if (variants === undefined || !variants.every(isRequiredOnlyBranch)) {
    return object
  }

  /**
   * The branches are mutually exclusive required-key sets. Enforcing "exactly
   * one branch satisfied" here turns a 400 round trip into a local failure.
   */
  const branches = variants.map((variant) => (variant.required ?? []).map(quote).join(', '))
  const check = branches.map((keys) => `[${keys}].every((key) => value[key] !== undefined)`).join(',\n    ')

  return `${object}.refine(
  (value: Record<string, unknown>) => {
    const satisfied = [
    ${check},
    ].filter(Boolean).length
    return satisfied === 1
  },
  { message: ${quote(`Provide exactly one of: ${branches.map((b) => b.replace(/'/g, '')).join(' | ')}`)} }
)`
}

/**
 * Orders components so a schema is declared after everything it references.
 * The spec has no cycles today; one would surface here rather than as an
 * undefined at import time.
 */
function order(): string[] {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const sorted: string[] = []

  function refsOf(schema: JsonSchema, into: Set<string>): void {
    if (schema.$ref !== undefined) {
      into.add(refName(schema.$ref))
    }
    for (const child of [
      ...(schema.oneOf ?? []),
      ...(schema.anyOf ?? []),
      ...(schema.allOf ?? []),
      ...Object.values(schema.properties ?? {}),
      ...(schema.items === undefined ? [] : [schema.items]),
      ...(typeof schema.additionalProperties === 'object' ? [schema.additionalProperties] : []),
    ]) {
      refsOf(child, into)
    }
  }

  function visit(name: string): void {
    if (visited.has(name)) {
      return
    }
    if (visiting.has(name)) {
      throw new Error(`Cyclic schema reference through ${name}; add a z.lazy branch to the generator`)
    }

    visiting.add(name)
    const dependencies = new Set<string>()
    const schema = schemas[name]
    if (schema !== undefined) {
      refsOf(schema, dependencies)
    }
    for (const dependency of dependencies) {
      if (dependency !== name && schemas[dependency] !== undefined) {
        visit(dependency)
      }
    }
    visiting.delete(name)
    visited.add(name)
    sorted.push(name)
  }

  for (const name of Object.keys(schemas)) {
    visit(name)
  }

  return sorted
}

/** Renders the query-parameter type for every operation that takes one. */
function renderParams(): string {
  const blocks: string[] = []

  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) {
        continue
      }

      const query = (operation.parameters ?? []).filter((parameter) => parameter.in === 'query')
      if (query.length === 0 || operation.operationId === undefined) {
        continue
      }

      const name = `${operation.operationId.charAt(0).toUpperCase()}${operation.operationId.slice(1)}Params`
      const fields = query.map((parameter) => {
        const doc = jsdoc(parameter.description, '  ')
        const optional = parameter.required === true ? '' : '?'
        return `${doc}  readonly ${propertyKey(parameter.name)}${optional}: ${tsType(parameter.schema)}`
      })

      blocks.push(
        `${jsdoc(`Query parameters for \`${method.toUpperCase()} ${path}\`.`, '')}export type ${name} = {\n${fields.join('\n')}\n}`
      )
    }
  }

  return blocks.join('\n\n')
}

/** A TypeScript type for a query parameter, which is always a scalar or list. */
function tsType(schema: JsonSchema | undefined): string {
  if (schema === undefined) {
    return 'string'
  }
  if (schema.enum !== undefined && schema.enum.every((value) => typeof value === 'string')) {
    return schema.enum.map((value) => quote(value as string)).join(' | ')
  }
  switch (schema.type) {
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return `ReadonlyArray<${tsType(schema.items)}>`
    default:
      return 'string'
  }
}

const declarations = order().map((name) => {
  const schema = schemas[name]
  if (schema === undefined) {
    return ''
  }

  const doc = jsdoc(schema.description, '')
  return `${doc}export const ${constName(name)} = ${toZod(schema, '')}\n\nexport type ${name} = z.infer<typeof ${constName(name)}>`
})

const output = `/**
 * Schemas for the Bachs API, generated from \`resources/openapi.json\`.
 *
 * DO NOT EDIT BY HAND. Run \`npm run generate:schemas\` after updating the
 * vendored spec, and review the diff.
 *
 * A field is optional here exactly when the specification does not list it as
 * required. Where Bachs documents no required set for a response object, every
 * field parses as optional: this package will not promise a presence the API
 * does not, because a parse that rejects a genuine payment is worse than a
 * field you have to check.
 *
 * Money is always a decimal string at the currency's precision (\`"29.00"\`),
 * paired with an ISO 4217 currency. There are no minor units anywhere in this
 * API, so nothing here is a number you can safely do arithmetic on.
 */
import { z } from 'zod'

/**
 * A string enum that reads either casing and hands back the one the
 * specification documents.
 *
 * The API and its document disagree on case for several enums — a checkout
 * session is created with \`status: "open"\` where the spec says \`OPEN\` — and
 * rejecting a real, paid checkout over letter case is the worst possible
 * trade. Unknown values still fail, so a genuinely new state is not swallowed.
 */
function caseInsensitiveEnum<const T extends readonly [string, ...string[]]>(values: T) {
  const canonical = new Map(values.map((value) => [value.toLowerCase(), value]))

  return z.preprocess(
    (value) => (typeof value === 'string' ? (canonical.get(value.toLowerCase()) ?? value) : value),
    z.enum(values)
  )
}

${declarations.join('\n\n')}

/*
|--------------------------------------------------------------------------
| Query parameters
|--------------------------------------------------------------------------
*/

${renderParams()}
`

writeFileSync(join(root, 'src/schemas.ts'), output)

process.stdout.write(
  `Generated src/schemas.ts — ${Object.keys(schemas).length} schemas, ${output.split('\n').length} lines\n`
)

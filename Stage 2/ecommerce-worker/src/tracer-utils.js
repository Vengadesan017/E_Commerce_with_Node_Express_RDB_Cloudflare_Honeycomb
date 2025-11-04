// tracer-utils.js
import { makeSpan, sendSpanToHoneycomb } from './tracer.js'

export async function runWithSpan(env, traceId, name, parentSpanId, fn, attributes = {}) {
  const span = makeSpan(traceId, name, attributes, parentSpanId)
  const start = Date.now()
  try {
    const result = await fn()
    span.attributes.status = 'success'
    span.attributes.duration_ms = Date.now() - start
    await sendSpanToHoneycomb(env, span)
    return result
  } catch (err) {
    span.attributes.status = 'error'
    span.attributes.error = err.message
    span.attributes.duration_ms = Date.now() - start
    await sendSpanToHoneycomb(env, span)
    throw err
  }
}

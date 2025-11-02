/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// export default {
// 	async fetch(request, env, ctx) {
// 		return new Response('Hello World!');
// 	},
// };


/*
import { Router } from 'itty-router'

const router = Router()

router.get('/', () => new Response('Worker alive ✅'))
router.get('/ping', () => new Response('pong 🏓'))
router.all('*', () => new Response('Not Found', { status: 404 }))

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await router.handle(request, env, ctx)
      return response || new Response('Fallback: No route matched', { status: 404 })
    } catch (err) {
      return new Response('Internal Error: ' + err.message, { status: 500 })
    }
  },
}
*/


// index.js
import { Router } from 'itty-router'
import Joi from 'joi'
import { Logger } from './logger.js'
import { makeSpan, sendSpanToHoneycomb } from './tracer.js'

const router = Router()

// Joi schema
const productSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  price: Joi.number().positive().required(),
  stock: Joi.number().integer().min(0).required(),
})

// Health and r2-list
router.get('/', () => new Response('Worker alive ✅'))
router.get('/ping', () => new Response('pong 🏓'))
router.get('/r2-list', async (req, env) => {
  try {
	console.log(env);
    const objects = await env.mylogs.list()
    const keys = (objects.objects || []).map(o => o.key)
    return new Response(JSON.stringify(keys, null, 2), { headers: { 'content-type': 'application/json' }})
  } catch (err) {
    return new Response('R2 list error: ' + (err?.message || err), { status: 500 })
  }
})

// Helper: create traceId per request
function newTraceId() {
  // use crypto.randomUUID() for readable UUID per request
  return crypto.randomUUID()
}

/* -------------------------- Products API -------------------------- */

// GET all products
router.get('/products', async (req, env) => {
  const traceId = newTraceId()
  const logger = new Logger(env, traceId)
  const span = makeSpan(traceId, 'GET /products', { endpoint: '/products' })

  try {
    const { results } = await env.mydb.prepare('SELECT * FROM products ORDER BY id ASC').all()
    await logger.debug('Fetched products', { count: results.length })
	span.attributes = span.attributes || {};
    span.attributes.status = 'success'
    await sendSpanToHoneycomb(env, span)
    return Response.json(results)
  } catch (err) {
    span.attributes = span.attributes || {}
    span.attributes.status = 'error'
    span.attributes.error = err?.message
    await sendSpanToHoneycomb(env, span)

    await logger.error('Error fetching products', { error: err?.message })
    return new Response('Internal server error: ' + (err?.message || err), { status: 500 })
  }
})

// GET product by id
router.get('/products/:id', async (req, env) => {
  const traceId = newTraceId()
  const logger = new Logger(env, traceId)
  const span = makeSpan(traceId, 'GET /products/:id', { endpoint: '/products/:id' })

  try {
    const id = Number(req.params.id)
    const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(id).all()
    if (!results || results.length === 0) {
      await logger.debug('Product not found', { id })
	  span.attributes = span.attributes || {};
      span.attributes.status = 'not_found'
      await sendSpanToHoneycomb(env, span)
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }
    await logger.debug('Fetched product', { id })
	span.attributes = span.attributes || {};
    span.attributes.status = 'success'
    await sendSpanToHoneycomb(env, span)
    return Response.json(results[0])
  } catch (err) {
    await logger.error('Error fetching product', { error: err?.message })
    span.attributes = span.attributes || {}
    span.attributes.status = 'error'
    span.attributes.error = err?.message
    await sendSpanToHoneycomb(env, span)
    return new Response('Internal server error: ' + (err?.message || err), { status: 500 })
  }
})

// POST create product
router.post('/products', async (req, env) => {
  const traceId = newTraceId()
  const logger = new Logger(env, traceId)
  const span = makeSpan(traceId, 'POST /products', { endpoint: '/products' })

  const start = Date.now();
  try {
    let body
    try { body = await req.json() } catch (e) {
      await logger.error('Invalid JSON body', { error: e?.message })
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { error, value } = productSchema.validate(body)
    if (error) {
      await logger.error('Validation failed', { error: error.details[0].message })
      return Response.json({ error: error.details[0].message }, { status: 400 })
    }

    const { name, price, stock } = value

    const insertStmt = await env.mydb.prepare(
      'INSERT INTO products (name, price, stock) VALUES (?, ?, ?)'
    ).bind(name, price, stock).run()

    const insertedId = insertStmt?.meta?.last_row_id
    const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(insertedId).all()

    await logger.event('Product created', { id: insertedId, name })
	const duration = Date.now() - start;
	span.attributes.duration_ms = duration;
	span.attributes = span.attributes || {};
    span.attributes.status = 'success'
    span.attributes.productId = insertedId
    await sendSpanToHoneycomb(env, span)

    // persist event log to R2 (already done in Logger but store a specific file)
    try {
      await env.mylogs.put(`product-create-${insertedId}.json`, JSON.stringify(results[0], null, 2))
    } catch (e) {
      // best-effort
      console.error('R2 put failed for created product', e?.message)
    }

    return Response.json({ message: 'Product added', product: results[0] }, { status: 201 })
  } catch (err) {
    await logger.error('Error creating product', { error: err?.message })
	const duration = Date.now() - start;
	span.attributes.duration_ms = duration;
    span.attributes = span.attributes || {}
    span.attributes.status = 'error'
    span.attributes.error = err?.message
    await sendSpanToHoneycomb(env, span)
    return new Response('Internal server error: ' + (err?.message || err), { status: 500 })
  }
})

// PUT update product
router.put('/products/:id', async (req, env) => {
  const traceId = newTraceId()
  const logger = new Logger(env, traceId)
  const span = makeSpan(traceId, 'PUT /products/:id', { endpoint: '/products/:id' })

  try {
    const id = Number(req.params.id)
    let body
    try { body = await req.json() } catch(e) {
      await logger.error('Invalid JSON body', { error: e?.message })
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { error, value } = productSchema.validate(body)
    if (error) {
      await logger.error('Validation failed', { error: error.details[0].message })
      return Response.json({ error: error.details[0].message }, { status: 400 })
    }

    const { name, price, stock } = value
    const stmt = await env.mydb.prepare(
      'UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?'
    ).bind(name, price, stock, id).run()

    if (!stmt || stmt.changes === 0) {
      await logger.debug('Product not found for update', { id })
	  span.attributes = span.attributes || {};
      span.attributes.status = 'not_found'
      await sendSpanToHoneycomb(env, span)
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(id).all()
    await env.mylogs.put(`product-update-${id}.json`, JSON.stringify(results[0], null, 2))
    await logger.event('Product updated', { id })
	span.attributes = span.attributes || {};
    span.attributes.status = 'success'
    await sendSpanToHoneycomb(env, span)

    return Response.json({ message: 'Product updated', product: results[0] })
  } catch (err) {
    await logger.error('Error updating product', { error: err?.message })
    span.attributes = span.attributes || {}
    span.attributes.status = 'error'
    span.attributes.error = err?.message
    await sendSpanToHoneycomb(env, span)
    return new Response('Internal server error: ' + (err?.message || err), { status: 500 })
  }
})

// DELETE product
router.delete('/products/:id', async (req, env) => {
  const traceId = newTraceId()
  const logger = new Logger(env, traceId)
  const span = makeSpan(traceId, 'DELETE /products/:id', { endpoint: '/products/:id' })

  try {
    const id = Number(req.params.id)
    const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(id).all()
    if (!results || results.length === 0) {
      await logger.debug('Product not found for delete', { id })
	  span.attributes = span.attributes || {};
      span.attributes.status = 'not_found'
      await sendSpanToHoneycomb(env, span)
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    await env.mydb.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
    await env.mylogs.put(`product-delete-${id}.json`, JSON.stringify(results[0], null, 2))
    await logger.event('Product deleted', { id })
	span.attributes = span.attributes || {};
    span.attributes.status = 'success'
    await sendSpanToHoneycomb(env, span)
    return Response.json({ message: 'Product deleted', product: results[0] })
  } catch (err) {
    await logger.error('Error deleting product', { error: err?.message })
    span.attributes = span.attributes || {}
    span.attributes.status = 'error'
    span.attributes.error = err?.message
    await sendSpanToHoneycomb(env, span)
    return new Response('Internal server error: ' + (err?.message || err), { status: 500 })
  }
})

router.all('*', () => new Response('Not Found', { status: 404 }))

export default {
  async fetch(req, env, ctx) {
    try {
      // Handle preflight requests (OPTIONS)
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      // Handle normal requests
      const response = await router.handle(req, env, ctx);

      // Clone response and add CORS headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      return new Response(response.body, { ...response, headers: newHeaders });

    } catch (err) {
      console.error('Unhandled error', err);
      return new Response('Internal Server Error', {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};



// import { Router } from 'itty-router'

// // Create router instance
// const router = Router()

// // --- Utility: log to R2 ---
// async function logToR2(env, type, message) {
//   const logData = {
//     timestamp: new Date().toISOString(),
//     type,
//     message,
//   }
//   const key = `${type}/${Date.now()}.json`
//   await env.mylogs.put(key, JSON.stringify(logData))
// }

// // --- ROUTES ---

// // GET all products
// router.get('/products', async (request, env) => {
//   try {
// 	console.log('Fetching all products');
//     const { results } = await env.mydb.prepare('SELECT * FROM products').all()
//     await logToR2(env, 'event', 'Fetched all products')
//     return Response.json(results)
//   } catch (err) {
//     await logToR2(env, 'error', err.message)
//     return new Response(JSON.stringify({ error: err.message }), { status: 500 })
//   }
// })

// // POST new product
// router.post('/products', async (request, env) => {
//   try {
//     const data = await request.json()
//     const { name, price, stock } = data

//     await env.mydb.prepare(
//       'INSERT INTO products (name, price, stock) VALUES (?, ?, ?)'
//     ).bind(name, price, stock).run()

//     await logToR2(env, 'event', `Added new product: ${name}`)
//     return new Response(JSON.stringify({ message: 'Product added successfully' }), { status: 201 })
//   } catch (err) {
//     await logToR2(env, 'error', err.message)
//     return new Response(JSON.stringify({ error: err.message }), { status: 500 })
//   }
// })

// // Default route
// router.all('*', () => new Response('Not Found', { status: 404 }))

// // Worker fetch handler
// export default {
//   async fetch(request, env, ctx) {
//     return router.handle(request, env, ctx)
//   }
// }

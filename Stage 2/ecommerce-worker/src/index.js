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
import { runWithSpan, addLog } from './tracer-utils.js'

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
  const rayId = req.headers.get('cf-ray') || 'no-ray-id';
  const root = makeSpan(traceId, 'GET /products', { ray_id: rayId })
    const start = Date.now()
// const headersObj = Object.fromEntries(req.headers.entries());
// console.log('Request headers:', JSON.stringify(headersObj, null, 2));
  try {
    addLog(root, 'Starting product fetch from database')
    const results = await runWithSpan(env, traceId, 'db_query_products', root.span_id, async () => {
      const { results } = await env.mydb.prepare('SELECT * FROM products ORDER BY id ASC').all()
      addLog(root, 'Database returned products', 'debug', { count: results.length })
      return results
    })
    root.attributes.status = 'success'
    root.attributes.duration_ms = Date.now() - start
    addLog(root, 'Finished processing request', 'info', { duration: root.attributes.duration_ms })
    await sendSpanToHoneycomb(env, root)
    return Response.json(results)
  } catch (err) {
    root.attributes.status = 'error'
    root.attributes.error = err.message
    addLog(root, 'Error fetching products', 'error', { error: err.message })

    await sendSpanToHoneycomb(env, root)
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// GET product by id
router.get('/products/:id', async (req, env) => {
  const traceId = newTraceId()
  const rayId = req.headers.get('cf-ray') || 'no-ray-id';
  const root = makeSpan(traceId, 'GET /products/:id', { ray_id: rayId })
  const start = Date.now()

  try {
    addLog(root, `Fetching product with id ${req.params.id}`)
    const id = await runWithSpan(env, traceId, 'parse_path_params', root.span_id, async () => Number(req.params.id))
    addLog(root, `Parsed product id: ${id}`, 'debug')
    const product = await runWithSpan(env, traceId, 'db_query_product_by_id', root.span_id, async () => {
      const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(id).all()
      addLog(root, `Database returned ${results.length} products`, 'debug')
      return results[0]
    })

    if (!product) {
      root.attributes.status = 'not_found'
      addLog(root, `Product with id ${id} not found`, 'warning')
      await sendSpanToHoneycomb(env, root)
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    root.attributes.status = 'success'
    root.attributes.duration_ms = Date.now() - start
    addLog(root, 'Finished processing request', 'info', { duration: root.attributes.duration_ms })
    await sendSpanToHoneycomb(env, root)
    return Response.json(product)
  } catch (err) {
    root.attributes.status = 'error'
    root.attributes.error = err.message
    addLog(root, 'Error fetching product by id', 'error', { error: err.message })
    await sendSpanToHoneycomb(env, root)
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// POST create product
router.post('/products', async (req, env) => {
  const traceId = newTraceId()
  const rayId = req.headers.get('cf-ray') || 'no-ray-id';
  const root = makeSpan(traceId, 'POST /products', { ray_id: rayId })
  const start = Date.now()

  try {
    addLog(root, 'Parsing request body')
    const body = await runWithSpan(env, traceId, 'parse_request', root.span_id, async () => await req.json())
    addLog(root, 'Validating input data')
    const valid = await runWithSpan(env, traceId, 'validate_input', root.span_id, async () => {
      const { error, value } = productSchema.validate(body)
      if (error) throw new Error(error.details[0].message)
      return value
    })
    addLog(root, 'Inserting new product into database')
    const insertedId = await runWithSpan(env, traceId, 'db_insert_product', root.span_id, async () => {
      const stmt = await env.mydb
        .prepare('INSERT INTO products (name, price, stock) VALUES (?, ?, ?)')
        .bind(valid.name, valid.price, valid.stock)
        .run()
      return stmt?.meta?.last_row_id
    })
    addLog(root, `New product inserted with id ${insertedId}`)
    const product = await runWithSpan(env, traceId, 'db_select_new_product', root.span_id, async () => {
      const { results } = await env.mydb
        .prepare('SELECT * FROM products WHERE id = ?')
        .bind(insertedId)
        .all()
      return results[0]
    })

    addLog(root, 'Writing product creation log to R2')
    await runWithSpan(env, traceId, 'r2_write_product_log', root.span_id, async () => {
      await env.mylogs.put(`product-create-${insertedId}.json`, JSON.stringify(product, null, 2))
    })
    
    root.attributes.status = 'success'
    root.attributes.duration_ms = Date.now() - start
    addLog(root, 'Finished processing request', 'info', { duration: root.attributes.duration_ms })
    await sendSpanToHoneycomb(env, root)
    return Response.json({ message: 'Product added', product }, { status: 201 })
  } catch (err) {
    root.attributes.status = 'error'
    root.attributes.error = err.message
    root.attributes.duration_ms = Date.now() - start
    await sendSpanToHoneycomb(env, root)
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// PUT update product
router.put('/products/:id', async (req, env) => {
  const traceId = newTraceId()
  const rayId = req.headers.get('cf-ray') || 'no-ray-id';
  const root = makeSpan(traceId, 'PUT /products/:id')
  const start = Date.now()

  try {
    addLog(root, `Updating product with id ${req.params.id}`)
    const id = Number(req.params.id)
    const body = await runWithSpan(env, traceId, 'parse_request', root.span_id, async () => await req.json())
    addLog(root, 'Validating input data')
    const valid = await runWithSpan(env, traceId, 'validate_input', root.span_id, async () => {
      const { error, value } = productSchema.validate(body)
      if (error) throw new Error(error.details[0].message)
      return value
    })
    addLog(root, 'Updating product in database')
    const updateResult = await runWithSpan(env, traceId, 'db_update_product', root.span_id, async () => {
      return await env.mydb
        .prepare('UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?')
        .bind(valid.name, valid.price, valid.stock, id)
        .run()
    })

    if (!updateResult || updateResult.changes === 0) {
      root.attributes.status = 'not_found'
      addLog(root, `Product with id ${id} not found for update`, 'warning')
      await sendSpanToHoneycomb(env, root)
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    addLog(root, 'Fetching updated product from database')
    const product = await runWithSpan(env, traceId, 'db_fetch_updated_product', root.span_id, async () => {
      const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(id).all()
      return results[0]
    })

    addLog(root, 'Writing product update log to R2')
    await runWithSpan(env, traceId, 'r2_write_update_log', root.span_id, async () => {
      await env.mylogs.put(`product-update-${id}.json`, JSON.stringify(product, null, 2))
    })

    root.attributes.status = 'success'
    root.attributes.duration_ms = Date.now() - start
    addLog(root, 'Finished processing request', 'info', { duration: root.attributes.duration_ms })
    await sendSpanToHoneycomb(env, root)
    return Response.json({ message: 'Product updated', product })
  } catch (err) {
    root.attributes.status = 'error'
    root.attributes.error = err.message
    root.attributes.duration_ms = Date.now() - start
    addLog(root, 'Error updating product', 'error', { error: err.message })
    await sendSpanToHoneycomb(env, root)
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// DELETE product
router.delete('/products/:id', async (req, env) => {
  const traceId = newTraceId()
  const rayId = req.headers.get('cf-ray') || 'no-ray-id';
  const root = makeSpan(traceId, 'DELETE /products/:id')
  const start = Date.now()

  try {
    addLog(root, `Deleting product with id ${req.params.id}`)
    const id = Number(req.params.id)
    
    addLog(root, 'Fetching product before deletion')
    const product = await runWithSpan(env, traceId, 'db_fetch_before_delete', root.span_id, async () => {
      const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(id).all()
      return results[0]
    })

    if (!product) {
      addLog(root, `Product with id ${id} not found for deletion`, 'warning')
      root.attributes.status = 'not_found'
      await sendSpanToHoneycomb(env, root)
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    addLog(root, 'Deleting product from database')
    await runWithSpan(env, traceId, 'db_delete_product', root.span_id, async () => {
      await env.mydb.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
    })

    addLog(root, 'Writing product deletion log to R2')
    await runWithSpan(env, traceId, 'r2_write_delete_log', root.span_id, async () => {
      await env.mylogs.put(`product-delete-${id}.json`, JSON.stringify(product, null, 2))
    })

    addLog(root, 'Finished processing request', 'info', { duration: Date.now() - start }) 
    root.attributes.status = 'success'
    root.attributes.duration_ms = Date.now() - start
    await sendSpanToHoneycomb(env, root)
    return Response.json({ message: 'Product deleted', product })
  } catch (err) {
    root.attributes.status = 'error'
    root.attributes.error = err.message
    root.attributes.duration_ms = Date.now() - start
    addLog(root, 'Error deleting product', 'error', { error: err.message })
    await sendSpanToHoneycomb(env, root)
    return new Response('Internal server error: ' + err.message, { status: 500 })
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

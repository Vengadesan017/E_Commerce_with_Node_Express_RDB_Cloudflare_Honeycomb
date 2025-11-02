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



import { Router } from 'itty-router'
import Joi from 'joi'

// --- Initialize router ---
const router = Router()

// --- JOI VALIDATION SCHEMA ---
const productSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  price: Joi.number().positive().required(),
  stock: Joi.number().integer().min(0).required(),
})

// --- Health check routes ---
router.get('/', () => new Response('Worker alive ✅'))
router.get('/ping', () => new Response('pong 🏓'))
router.get('/r2-list', async (req, env) => {
  const objects = await env.mylogs.list()
  const keys = objects.objects.map(o => o.key)
  return new Response(JSON.stringify(keys, null, 2), {
    headers: { 'content-type': 'application/json' }
  })
})


// --- GET all products ---
router.get('/products', async (request, env) => {
  try {
    const { results } = await env.mydb.prepare(
      'SELECT * FROM products ORDER BY id ASC'
    ).all()
    return Response.json(results)
  } catch (err) {
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// --- GET single product by ID ---
router.get('/products/:id', async (request, env) => {
  try {
    const id = Number(request.params.id)
    const { results } = await env.mydb.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).bind(id).all()

    if (results.length === 0) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    return Response.json(results[0])
  } catch (err) {
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// --- CREATE new product ---
router.post('/products', async (request, env) => {
  try {
    const body = await request.json()
    const { error, value } = productSchema.validate(body)
    if (error) {
      return Response.json({ error: error.details[0].message }, { status: 400 })
    }

    const { name, price, stock } = value
// 
	const stmt = await env.mydb.prepare(
	'INSERT INTO products (name, price, stock) VALUES (?, ?, ?)'
	).bind(name, price, stock).run()

	const insertedId = stmt.meta.last_row_id

	const { results } = await env.mydb.prepare(
	'SELECT * FROM products WHERE id = ?'
	).bind(insertedId).all()
// 
    // const stmt = await env.mydb.prepare(
    //   'INSERT INTO products (name, price, stock) VALUES (?, ?, ?)'
    // ).bind(name, price, stock).run()

    // const { results } = await env.mydb.prepare(
    //   'SELECT * FROM products WHERE id = ?'
    // ).bind(stmt.lastRowId).all()

    // Optional: store log in R2 bucket
    await env.mylogs.put(`product-create-${stmt.lastRowId}.json`, JSON.stringify(results[0]))

    return Response.json({ message: 'Product added', product: results[0] }, { status: 201 })
  } catch (err) {
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// --- UPDATE a product ---
router.put('/products/:id', async (request, env) => {
  try {
    const id = Number(request.params.id)
    const body = await request.json()
    const { error, value } = productSchema.validate(body)
    if (error) {
      return Response.json({ error: error.details[0].message }, { status: 400 })
    }

    const { name, price, stock } = value
    const stmt = await env.mydb.prepare(
      'UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?'
    ).bind(name, price, stock, id).run()

    if (stmt.changes === 0) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(id).all()

    await env.mylogs.put(`product-update-${id}.json`, JSON.stringify(results[0]))

    return Response.json({ message: 'Product updated', product: results[0] })
  } catch (err) {
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// --- DELETE a product ---
router.delete('/products/:id', async (request, env) => {
  try {
    const id = Number(request.params.id)
    const { results } = await env.mydb.prepare('SELECT * FROM products WHERE id = ?').bind(id).all()

    if (results.length === 0) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    await env.mydb.prepare('DELETE FROM products WHERE id = ?').bind(id).run()

    await env.mylogs.put(`product-delete-${id}.json`, JSON.stringify(results[0]))

    return Response.json({ message: 'Product deleted', product: results[0] })
  } catch (err) {
    return new Response('Internal server error: ' + err.message, { status: 500 })
  }
})

// --- Catch-all route ---
router.all('*', () => new Response('Not Found', { status: 404 }))

// --- Worker export ---
export default {
  async fetch(request, env, ctx) {
    try {
      return await router.handle(request, env, ctx)
    } catch (err) {
      return new Response('Internal Error: ' + err.message, { status: 500 })
    }
  },
}


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

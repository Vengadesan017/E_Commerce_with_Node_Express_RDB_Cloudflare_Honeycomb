// logger.js
export class Logger {
  constructor(env, traceId = null) {
    this.env = env
    this.traceId = traceId
  }

  async log(level, message, context = {}) {
    const entry = {
      level,
      message,
      traceId: this.traceId,
      context,
      ts: new Date().toISOString(),
    }

    // Console (useful for wrangler dev logs)
    console.log(JSON.stringify(entry))

    // Persist to R2 (if available) - non-blocking failure is tolerated
    try {
      if (this.env?.mylogs) {
        const key = `logs/${level}/log-${entry.ts}-${crypto.randomUUID()}.json`
        await this.env.mylogs.put(key, JSON.stringify(entry, null, 2))
      }
    } catch (e) {
      // don't throw — we want logging to be best-effort
      console.error('R2 write failed', e?.message || e)
    }
  }

  async debug(msg, ctx = {}) { await this.log('debug', msg, ctx) }
  async event(msg, ctx = {}) { await this.log('event', msg, ctx) }
  async info(msg, ctx = {}) { await this.log('info', msg, ctx) }
  async error(msg, ctx = {}) { await this.log('error', msg, ctx) }
}

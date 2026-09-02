#!/usr/bin/env node
/**
 * A local stand-in for the Upstash REST API, backed by a plain `redis-server`.
 *
 * Upstash's REST protocol is just "POST a JSON array of Redis command
 * arguments, get back {result} or {error}". This translates that to RESP over a
 * TCP socket, which means local development needs no Upstash account and no
 * network — and, importantly, it is a *real* Redis, so blocking XREAD and
 * stream semantics behave exactly as they do in production.
 *
 *   redis-server --port 6379 &
 *   node scripts/upstash-shim.mjs        # listens on :8079
 *
 *   KV_REST_API_URL=http://127.0.0.1:8079
 *   KV_REST_API_TOKEN=local-dev
 *
 * Development only. There is no auth check and no TLS.
 */
import net from 'node:net';
import http from 'node:http';

const REDIS_HOST = process.env.SHIM_REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = Number(process.env.SHIM_REDIS_PORT ?? 6379);
const PORT = Number(process.env.SHIM_PORT ?? 8079);

/* ----------------------------------------------------------------- RESP */

function encode(args) {
  let out = `*${args.length}\r\n`;
  for (const a of args) {
    const s = String(a);
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return out;
}

/** Returns [value, bytesConsumed] or null when more data is still needed. */
function decode(buf, i = 0) {
  if (i >= buf.length) return null;
  // `buf` is a latin1 string (1 char == 1 byte), so read the marker as a code.
  const type = buf.charCodeAt(i);
  const nl = buf.indexOf('\r\n', i);
  if (nl === -1) return null;
  const head = buf.slice(i + 1, nl);
  const after = nl + 2;

  switch (type) {
    case 0x2b: return [head, after];                       // +simple
    case 0x2d: return [new Error(head), after];            // -error
    case 0x3a: return [Number(head), after];               // :integer
    case 0x24: {                                           // $bulk
      const len = Number(head);
      if (len === -1) return [null, after];
      if (buf.length < after + len + 2) return null;
      return [buf.slice(after, after + len), after + len + 2];
    }
    case 0x2a: {                                           // *array
      const len = Number(head);
      if (len === -1) return [null, after];
      const arr = [];
      let cursor = after;
      for (let n = 0; n < len; n++) {
        const next = decode(buf, cursor);
        if (!next) return null;
        arr.push(next[0]);
        cursor = next[1];
      }
      return [arr, cursor];
    }
    default:
      throw new Error(`Unsupported RESP type: ${JSON.stringify(String.fromCharCode(type))}`);
  }
}

/** One short-lived connection per command keeps reply framing trivial. */
function run(args) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: REDIS_HOST, port: REDIS_PORT });
    let buf = '';
    sock.setEncoding('binary');
    // Written as a UTF-8 Buffer: the $<len> prefixes are byte counts, so a
    // latin1 write would desync the protocol on any multi-byte char (emoji).
    sock.on('connect', () => sock.write(Buffer.from(encode(args), 'utf8')));
    sock.on('data', (chunk) => {
      buf += chunk;
      let parsed;
      try {
        parsed = decode(buf);
      } catch (err) {
        sock.destroy();
        return reject(err);
      }
      if (parsed) {
        sock.end();
        const [value] = parsed;
        value instanceof Error ? reject(value) : resolve(value);
      }
    });
    sock.on('error', reject);
    // XREAD BLOCK can legitimately hold the socket open for a long time.
    sock.setTimeout(120_000, () => {
      sock.destroy();
      reject(new Error('redis timeout'));
    });
  });
}

/**
 * The socket is read as latin1 so that 1 char == 1 byte during framing, which
 * means every returned string is really raw bytes. Convert at the edge:
 * @upstash/redis sends `Upstash-Encoding: base64` and expects base64 back,
 * while a plain fetch (as used by the SSE blocking read) expects UTF-8.
 */
function finalize(value, base64) {
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'latin1');
    return base64 ? bytes.toString('base64') : bytes.toString('utf8');
  }
  if (Array.isArray(value)) return value.map((v) => finalize(v, base64));
  return value;
}

/* ----------------------------------------------------------------- HTTP */

http
  .createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ result: 'upstash-shim ok' }));
    }
    const base64 = (req.headers['upstash-encoding'] ?? '').toString().toLowerCase() === 'base64';
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const parsed = JSON.parse(body || '[]');
        // Upstash accepts a single command or a pipeline (array of arrays).
        const isPipeline = Array.isArray(parsed[0]);
        const results = isPipeline
          ? await Promise.all(
              parsed.map((cmd) =>
                run(cmd).then(
                  (r) => ({ result: finalize(r, base64) }),
                  (e) => ({ error: String(e.message ?? e) })
                )
              )
            )
          : { result: finalize(await run(parsed), base64) };
        res.writeHead(200);
        res.end(JSON.stringify(results));
      } catch (err) {
        res.writeHead(200);
        res.end(JSON.stringify({ error: String(err?.message ?? err) }));
      }
    });
  })
  .listen(PORT, () => {
    console.log(`upstash-shim  http://127.0.0.1:${PORT}  ->  redis://${REDIS_HOST}:${REDIS_PORT}`);
  });

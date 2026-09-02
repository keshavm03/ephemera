# Ephemera

Login-free chat rooms that delete themselves.

Open a room, share the six-character code, talk. Text, GIFs, stickers, and
private DMs between people in the room. When the host ends it, the entire
transcript — including every DM — is deleted within seconds. There is no
account system, no database of past conversations, and no archive.

Built for Vercel: Next.js App Router + Upstash Redis + Server-Sent Events.

---

## How it works

```
                       ┌──────────────────────────────────────────┐
   POST /messages ───► │  Vercel Function                         │
                       │    validate → XADD room:<code>:stream    │──┐
                       └──────────────────────────────────────────┘  │
                                                                     ▼
                                                        ┌──────────────────────┐
                                                        │   Upstash Redis      │
                                                        │  meta   (hash, TTL)  │
                                                        │  stream (MAXLEN 500) │
                                                        │  members(hash, TTL)  │
                                                        └──────────────────────┘
                                                                     │
                       ┌──────────────────────────────────────────┐  │
   GET /stream  ◄───── │  Vercel Function (SSE, ~50s per cycle)   │◄─┘
       (EventSource)   │    XREAD BLOCK 25s  → filter → push      │
                       └──────────────────────────────────────────┘
```

### Why SSE and not WebSockets

Vercel functions cannot hold a WebSocket. The options are a third-party
realtime vendor (Pusher/Ably) or streaming over HTTP. This uses the latter:
one Server-Sent Events connection per client, which needs no extra vendor and
no client library — `EventSource` is built into every browser and handles
reconnection on its own.

Each function invocation streams for ~50 seconds and then closes cleanly,
staying inside Vercel's duration limit. Every message frame is tagged with its
Redis stream id as the SSE event id, so when the browser reconnects it sends
`Last-Event-ID` and the server resumes from exactly that point — no replayed
history, no dropped messages across the cycle.

### Why blocking reads matter

The obvious implementation polls Redis every 500ms. That costs roughly
**170,000 Redis commands per client per day** and would exhaust a free tier
within hours.

Instead the stream loop issues `XREAD BLOCK 25000` directly against Upstash's
REST endpoint, which holds the request open until a message actually arrives.
That is ~3,500 commands per client per day — roughly 50× cheaper — *and* it is
faster, because messages are pushed the instant they land rather than on the
next poll tick. `src/lib/stream-read.ts` keeps a minimum-elapsed floor so that
if a backend ever ignored `BLOCK`, the loop would degrade to a slow poll
instead of spinning.

### One stream, many conversations

A room's public channel and every DM inside it live in a **single** Redis
stream. Each entry carries a `channel` and, for DMs, a `to` field. The server
filters entries per connection before writing them to the socket.

This is what makes DMs cheap: a client with six open DM threads still costs one
blocking read, not seven. It is also what makes them private — a DM is filtered
out server-side and never reaches an uninvolved browser at all, so it cannot be
recovered from devtools or a paused debugger.

### Identity without accounts

There is no login. On join you pick a throwaway display name and the server
returns an **HMAC-signed, room-scoped, HttpOnly cookie** holding
`{uid, name, color, room, host}`.

The signature is what stops someone from editing a cookie to impersonate
another participant and read their DMs. The cookie is scoped to one room code,
so a session minted for one room cannot authorise another, and several rooms
can be open in one browser at once. Nothing about a person is stored outside
the room's own member hash.

### How deletion actually works

Two mechanisms, no cleanup job:

**Idle expiry.** Every key carries a TTL that every write pushes back out
(`touchRoom`). A room nobody talks in for 12 hours simply stops existing.

**Termination.** The host presses *End room*, and the server:

1. appends a goodbye marker to the stream, so live clients learn *why* the room
   vanished and who ended it;
2. **deletes** `meta` and `members` immediately;
3. leaves only the stream alive for a 15-second grace window, then it expires.

Step 2 has to be a delete rather than a short TTL, and this is the subtle part:
every write path calls `touchRoom`, which is an unconditional `EXPIRE`. While
the meta key still existed, a single reconnecting client's heartbeat would push
the TTL back to 12 hours and **resurrect a room the host had just destroyed**.
`EXPIRE` on a missing key is a no-op, so deleting closes that window. There is
a regression probe for exactly this in the test notes below.

---

## Running it locally

You need Node 18.18+ and either an Upstash account or a local Redis.

### With a local Redis (no account needed)

`scripts/upstash-shim.mjs` is a small stand-in for the Upstash REST API backed
by a plain `redis-server`. Upstash's protocol is just "POST a JSON array of
Redis arguments, get `{result}` back", so the shim translates that to RESP over
a socket. Because it is a *real* Redis underneath, blocking `XREAD` and stream
semantics behave exactly as they do in production.

```bash
npm install

npm run dev:redis     # terminal 1 — redis on :6399
npm run dev:shim      # terminal 2 — REST shim on :8079
npm run dev           # terminal 3 — the app on :3000
```

`.env.local`:

```
KV_REST_API_URL=http://127.0.0.1:8079
KV_REST_API_TOKEN=local-dev
SESSION_SECRET=any-long-random-string-at-least-16-chars
```

The shim is development-only: no auth check, no TLS.

### With Upstash

Copy the REST URL and token from the Upstash console into `.env.local` and skip
the first two terminals.

---

## Deploying to Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new).

2. **Add Redis.** In the project: *Storage → Create Database → Upstash for
   Redis → Connect*. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   automatically.

3. **Add the session secret.** *Settings → Environment Variables*:

   ```
   SESSION_SECRET = <output of: openssl rand -hex 32>
   ```

   Required. The app refuses to start a session without it, and it must be the
   same across deployments or every existing cookie is invalidated.

4. **Optional — GIF search.** Add `GIPHY_API_KEY` from
   [developers.giphy.com](https://developers.giphy.com/dashboard/). Without it
   the GIF tab explains itself and hides; stickers still work. The key stays
   server-side (a `NEXT_PUBLIC_` key would be readable in the client bundle).

5. Redeploy.

6. **Verify it.** Open `https://<your-app>.vercel.app/api/health`:

   ```json
   {
     "ok": true,
     "checks": {
       "redisConfigured": true,
       "sessionSecret": "ok",
       "redisLatencyMs": 12,
       "streams": "ok",
       "blockingReads": { "honoured": true, "blockedForMs": 3021 }
     }
   }
   ```

   `blockingReads.honoured` is the one to look at. The realtime design assumes
   Upstash's REST proxy holds `XREAD BLOCK` open. If it does not, the app still
   works — `stream-read.ts` has a minimum-elapsed floor that degrades it to a
   ~1s poll — but that costs roughly **25x more Redis commands per client**, and
   the only place that would otherwise surface is a surprise bill. If it reports
   `honoured: false`, raise `minElapsedMs` in `src/lib/stream-read.ts` to trade
   a little latency back for cost.

   The endpoint reports configuration *state* only, never any secret value.

### A note on Vercel plans

The SSE route sets `maxDuration = 60`. On Hobby that is the ceiling, and the
client reconnects roughly every 50 seconds — invisible to the user, but it does
mean one function invocation per client per minute. Rooms that need to stay
open for hours with many participants are cheaper on Pro with a longer
duration, which reduces the reconnect rate.

---

## What was verified

Tested end-to-end against a real Redis with three concurrent participants:

| Check | Result |
| --- | --- |
| Public message reaches all participants | ✅ |
| DM reaches the recipient | ✅ seen by Bob |
| DM does **not** reach a third party | ✅ Carol received 0 copies |
| GIF url from a non-Giphy host | ✅ rejected |
| Arbitrary string sent as a "sticker" | ✅ rejected |
| Posting with no session cookie | ✅ 401 |
| Non-host attempts to terminate | ✅ 403 |
| Host terminates | ✅ all clients notified, named the host |
| Reconnect during the grace window | ✅ told the room ended, not a retry loop |
| Heartbeat/send after termination | ✅ rejected, TTL never reset |
| Data actually gone after the window | ✅ zero keys remaining |
| SSE resume via `Last-Event-ID` | ✅ exact, no gap or duplicate |
| Rate limit (30 msgs / 10s) | ✅ 30 accepted, 10 limited |
| UTF-8 / emoji round-trip | ✅ |
| `XREAD BLOCK` honoured (local redis) | ✅ blocked 3032ms of 3000ms |

Not yet verified against Upstash's own REST proxy — `/api/health` measures it
on the deployed instance.

---

## Layout

```
src/
  app/
    page.tsx                    landing — create or join
    r/[code]/page.tsx           room; renders the join gate or the chat
    api/
      rooms/route.ts                    POST   create a room
      rooms/[code]/join/route.ts        POST   claim a name, get a session
      rooms/[code]/stream/route.ts      GET    the SSE feed
      rooms/[code]/messages/route.ts    POST   send (public or DM)
      rooms/[code]/heartbeat/route.ts   POST   presence for backgrounded tabs
      rooms/[code]/leave/route.ts       POST   drop out
      rooms/[code]/terminate/route.ts   POST   host only — destroys the room
      giphy/route.ts                    GET    key-hiding Giphy proxy
      health/route.ts                   GET    post-deploy self-check
  lib/
    room.ts          room lifecycle, messages, presence, termination
    stream-read.ts   blocking XREAD over the Upstash REST protocol
    session.ts       HMAC-signed room-scoped cookies
    validate.ts      message validation, GIF host allowlist
    keys.ts          key naming and every TTL constant
  components/        UI
  hooks/             useRoomStream — the EventSource client
scripts/
  upstash-shim.mjs   local Upstash REST stand-in for offline development
```

## Limits worth knowing

- A room retains its **last 500 messages** (`STREAM_MAXLEN`); older ones are
  trimmed. This is a chat room, not an archive.
- Presence has a 45-second window, so a crashed tab disappears from the roster
  within that time rather than instantly.
- Terminating is irreversible by design. There is no undo and no backup.

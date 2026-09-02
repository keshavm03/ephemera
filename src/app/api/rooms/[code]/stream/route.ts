import {
  getRoom,
  fetchSince,
  listMembers,
  heartbeat,
  decodeEntry,
  visibleTo,
  findTerminationNotice,
  TERMINATED_PREFIX,
} from '@/lib/room';
import { blockingXRead } from '@/lib/stream-read';
import { K } from '@/lib/keys';
import { readSession } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { fail, handleRouteError } from '@/lib/api';
import type { ServerEvent, Member } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ code: string }> };

/** Vercel caps function duration, so we close cleanly and let SSE reconnect. */
const MAX_CONNECTION_MS = 50_000;
const BLOCK_MS = 25_000;
const PRESENCE_INTERVAL_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * GET /api/rooms/:code/stream
 *
 * One SSE connection carries the public channel and every DM this person is
 * part of. Filtering happens here rather than in the browser, so an unrelated
 * DM never reaches a client that shouldn't see it.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const code = normalizeCode((await params).code);
    if (!code) return fail('Invalid room code', 400);

    const self = await readSession(code);
    if (!self) return fail('Join the room first', 401);

    const room = await getRoom(code);
    if (!room) {
      // EventSource retries any failed connection indefinitely, so answering a
      // dead room with 410 would leave the tab spinning. Send one `terminated`
      // frame instead — the client closes the stream on receipt.
      const by = (await findTerminationNotice(code)) ?? 'inactivity';
      return sseOnce({ type: 'terminated', by });
    }

    // EventSource replays its last id on reconnect; ?after= is the manual path.
    const url = new URL(req.url);
    const resumeFrom =
      req.headers.get('last-event-id') || url.searchParams.get('after') || null;

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ServerEvent, id?: string) => {
          if (closed) return;
          try {
            const frame =
              (id ? `id: ${id}\n` : '') +
              `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(frame));
          } catch {
            closed = true;
          }
        };

        const shutdown = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        req.signal.addEventListener('abort', shutdown);

        // Nudge proxies to start flushing immediately.
        controller.enqueue(encoder.encode(': open\n\n'));
        send({ type: 'hello', self, room });

        // --- backfill ------------------------------------------------------
        let cursor = resumeFrom;
        try {
          const since = await fetchSince(code, resumeFrom, self.uid);
          for (const m of since.messages) {
            // The marker is an internal sentinel, not something to render. It
            // can show up here whenever a client (re)connects inside the grace
            // window between `terminate` and the stream key expiring.
            if (m.kind === 'system' && m.body.startsWith(TERMINATED_PREFIX)) {
              send({ type: 'terminated', by: m.body.slice(TERMINATED_PREFIX.length) });
              shutdown();
              return;
            }
            send({ type: 'message', message: m }, m.id);
          }
          cursor = since.cursor ?? resumeFrom;
        } catch (err) {
          console.error('[ephemera] backfill failed', err);
        }
        // '0-0' means "everything"; correct when a resumed cursor is unknown.
        if (!cursor) cursor = '0-0';

        const deadline = Date.now() + MAX_CONNECTION_MS;

        // --- loop 1: messages, via blocking XREAD --------------------------
        const messageLoop = async () => {
          while (!closed && Date.now() < deadline) {
            const budget = Math.min(BLOCK_MS, Math.max(1000, deadline - Date.now()));
            let entries;
            try {
              entries = await blockingXRead(K.stream(code), cursor!, budget, req.signal);
            } catch (err) {
              if (closed || req.signal.aborted) return;
              console.error('[ephemera] xread failed', err);
              await sleep(2000);
              continue;
            }

            for (const entry of entries) {
              cursor = entry.id;
              const msg = decodeEntry(entry.id, entry.fields);
              if (!msg) continue;

              // The room's own goodbye frame. Announced before the keys expire
              // so live clients learn why everything is about to disappear.
              if (msg.kind === 'system' && msg.body.startsWith(TERMINATED_PREFIX)) {
                send({ type: 'terminated', by: msg.body.slice(TERMINATED_PREFIX.length) });
                shutdown();
                return;
              }
              if (visibleTo(msg, self.uid)) send({ type: 'message', message: msg }, msg.id);
            }
          }
        };

        // --- loop 2: presence + keepalive ----------------------------------
        const presenceLoop = async () => {
          let lastBeat = 0;
          let lastSignature = '';
          while (!closed && Date.now() < deadline) {
            try {
              if (Date.now() - lastBeat > HEARTBEAT_INTERVAL_MS) {
                await heartbeat(code, self.uid);
                lastBeat = Date.now();
              }

              const members: Member[] = await listMembers(code);
              // The roster is unchanged most of the time; only push on change
              // to keep the client from re-rendering the sidebar every tick.
              const signature = members.map((m) => `${m.uid}:${m.name}`).join(',');
              if (signature !== lastSignature) {
                lastSignature = signature;
                send({ type: 'presence', members });
              } else {
                send({ type: 'ping' });
              }

              // An empty roster means the room is gone — either terminated
              // (which deletes the roster outright) or simply expired. Pause
              // briefly so the message loop can deliver the goodbye marker and
              // name the host; only fall back to "inactivity" if none arrives.
              if (members.length === 0 && !(await getRoom(code))) {
                await sleep(1500);
                if (closed) return;
                const by = await findTerminationNotice(code);
                send({ type: 'terminated', by: by ?? 'inactivity' });
                shutdown();
                return;
              }
            } catch (err) {
              if (closed) return;
              console.error('[ephemera] presence failed', err);
            }
            await sleep(PRESENCE_INTERVAL_MS);
          }
        };

        await Promise.race([messageLoop(), presenceLoop()]);
        shutdown();
      },

      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Disables buffering on nginx-style proxies, which would otherwise
        // hold the whole stream until it closed.
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** A one-frame SSE response, for clients arriving after the room is gone. */
function sseOnce(event: ServerEvent) {
  return new Response(`data: ${JSON.stringify(event)}\n\n`, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

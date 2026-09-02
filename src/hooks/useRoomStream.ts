'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, Member, ServerEvent, SessionClaims } from '@/lib/types';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'ended';

interface RoomStream {
  messages: ChatMessage[];
  members: Member[];
  self: SessionClaims | null;
  status: ConnectionState;
  endedBy: string | null;
}

/**
 * Subscribes to the room's SSE feed.
 *
 * EventSource handles reconnection and replays `Last-Event-ID` for us, which is
 * why the server tags every message frame with its stream id — a dropped
 * connection resumes exactly where it left off instead of re-playing history.
 */
export function useRoomStream(code: string, initialSelf: SessionClaims): RoomStream {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [self, setSelf] = useState<SessionClaims | null>(initialSelf);
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [endedBy, setEndedBy] = useState<string | null>(null);

  // Ids already rendered. A reconnect can overlap by a frame or two, and
  // duplicated bubbles are far more noticeable than a missing one.
  const seen = useRef<Set<string>>(new Set());
  const ended = useRef(false);

  const push = useCallback((message: ChatMessage) => {
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    setMessages((prev) => [...prev, message]);
  }, []);

  useEffect(() => {
    if (ended.current) return;
    const es = new EventSource(`/api/rooms/${code}/stream`);

    es.onopen = () => setStatus('live');

    es.onmessage = (evt) => {
      let payload: ServerEvent;
      try {
        payload = JSON.parse(evt.data) as ServerEvent;
      } catch {
        return;
      }

      switch (payload.type) {
        case 'hello':
          setSelf(payload.self);
          setStatus('live');
          break;
        case 'message':
          push(payload.message);
          break;
        case 'presence':
          setMembers(payload.members);
          break;
        case 'terminated':
          ended.current = true;
          setEndedBy(payload.by);
          setStatus('ended');
          es.close();
          break;
        case 'ping':
          setStatus('live');
          break;
      }
    };

    es.onerror = () => {
      if (ended.current) {
        es.close();
        return;
      }
      // The server closes every ~50s to stay inside Vercel's function limit,
      // so an error here is usually just that planned cycle, not a failure.
      setStatus((s) => (s === 'live' ? 'reconnecting' : s));
    };

    return () => es.close();
  }, [code, push]);

  // A backgrounded tab gets its stream frozen; this restores presence promptly
  // on return rather than waiting for the roster to time the person out.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible' || ended.current) return;
      fetch(`/api/rooms/${code}/heartbeat`, { method: 'POST' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.members && setMembers(d.members))
        .catch(() => {});
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [code]);

  return { messages, members, self, status, endedBy };
}

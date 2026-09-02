'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoomStream } from '@/hooks/useRoomStream';
import { dmChannelId, dmPeer, type ChatMessage, type SessionClaims } from '@/lib/types';
import ChannelSidebar from './ChannelSidebar';
import MessageList from './MessageList';
import Composer from './Composer';
import RoomHeader from './RoomHeader';
import EndedOverlay from './EndedOverlay';

export interface OutgoingMessage {
  kind: 'text' | 'gif' | 'sticker';
  body: string;
  meta?: { w?: number; h?: number; alt?: string };
}

export default function RoomClient({
  code,
  title,
  initialSelf,
}: {
  code: string;
  title: string;
  initialSelf: SessionClaims;
}) {
  const router = useRouter();
  const { messages, members, self, status, endedBy } = useRoomStream(code, initialSelf);

  const me = self ?? initialSelf;
  const [activeChannel, setActiveChannel] = useState('room');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bucket messages by channel once per update instead of filtering the whole
  // list inside every child on every render.
  const byChannel = useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      const list = map.get(m.channel);
      if (list) list.push(m);
      else map.set(m.channel, [m]);
    }
    return map;
  }, [messages]);

  const visible = byChannel.get(activeChannel) ?? [];

  /* --- unread badges ---------------------------------------------------- */
  // Tracks the newest message id each channel had been *looked at* with.
  const [readMarks, setReadMarks] = useState<Record<string, string>>({});

  useEffect(() => {
    const list = byChannel.get(activeChannel);
    const newest = list?.length ? list[list.length - 1].id : null;
    if (newest) setReadMarks((prev) => (prev[activeChannel] === newest ? prev : { ...prev, [activeChannel]: newest }));
  }, [activeChannel, byChannel]);

  const unread = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [channel, list] of byChannel) {
      if (channel === activeChannel) continue;
      const mark = readMarks[channel];
      const idx = mark ? list.findIndex((m) => m.id === mark) : -1;
      // Your own messages should never light up a badge.
      counts[channel] = list.slice(idx + 1).filter((m) => m.from !== me.uid && m.kind !== 'system').length;
    }
    return counts;
  }, [byChannel, activeChannel, readMarks, me.uid]);

  /* --- sending ---------------------------------------------------------- */
  const sending = useRef(false);

  const send = useCallback(
    async (payload: OutgoingMessage) => {
      if (sending.current || status === 'ended') return;
      sending.current = true;
      setError(null);
      const peer = dmPeer(activeChannel, me.uid);
      try {
        const res = await fetch(`/api/rooms/${code}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, to: peer ?? undefined }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Message failed to send');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Message failed to send');
      } finally {
        sending.current = false;
      }
    },
    [code, activeChannel, me.uid, status]
  );

  const openDm = useCallback(
    (uid: string) => {
      setActiveChannel(dmChannelId(me.uid, uid));
      setSidebarOpen(false);
    },
    [me.uid]
  );

  async function leave() {
    await fetch(`/api/rooms/${code}/leave`, { method: 'POST' }).catch(() => {});
    router.push('/');
  }

  async function terminate() {
    const res = await fetch(`/api/rooms/${code}/terminate`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not end the room');
    }
    // The confirmation arrives as a `terminated` frame on the stream, which is
    // what actually flips the UI — for the host and everyone else at once.
  }

  const peerUid = dmPeer(activeChannel, me.uid);
  const peer = members.find((m) => m.uid === peerUid) ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <RoomHeader
        code={code}
        title={title}
        status={status}
        me={me}
        memberCount={members.length}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onLeave={leave}
        onTerminate={terminate}
      />

      <div className="flex min-h-0 flex-1">
        <ChannelSidebar
          open={sidebarOpen}
          members={members}
          me={me}
          activeChannel={activeChannel}
          unread={unread}
          onSelectRoom={() => {
            setActiveChannel('room');
            setSidebarOpen(false);
          }}
          onSelectDm={openDm}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {peerUid && (
            <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-900/40 px-4 py-2 text-xs text-ink-400">
              <span>🔒</span>
              <span>
                Private conversation with{' '}
                <strong className="text-ink-200">{peer?.name ?? 'someone who left'}</strong>. Only
                the two of you receive these messages.
              </span>
            </div>
          )}

          <MessageList messages={visible} me={me} channel={activeChannel} />

          {error && (
            <p role="alert" className="border-t border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}

          <Composer
            onSend={send}
            disabled={status === 'ended' || (Boolean(peerUid) && !peer)}
            placeholder={
              peerUid
                ? peer
                  ? `Message ${peer.name} privately…`
                  : 'This person has left the room'
                : `Message ${title}…`
            }
          />
        </main>
      </div>

      {status === 'ended' && <EndedOverlay by={endedBy} />}
    </div>
  );
}

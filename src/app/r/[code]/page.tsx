import Link from 'next/link';
import { getRoom } from '@/lib/room';
import { readSession } from '@/lib/session';
import { normalizeCode } from '@/lib/validate';
import { redisConfigured } from '@/lib/redis';
import JoinGate from '@/components/JoinGate';
import RoomClient from '@/components/RoomClient';

export const dynamic = 'force-dynamic';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const code = normalizeCode((await params).code);
  if (!code) return <Gone title="That isn’t a valid room code." />;

  if (!redisConfigured() || !process.env.SESSION_SECRET) {
    return <Gone title="This deployment isn’t configured yet." detail="Set the Redis and SESSION_SECRET environment variables — see the README." />;
  }

  const room = await getRoom(code);
  if (!room) {
    return (
      <Gone
        title="This room has ended."
        detail="Either the host closed it or it expired. Everything in it — messages, GIFs, DMs — has already been deleted."
      />
    );
  }

  // Already carrying a valid session cookie for this room? Walk straight in.
  const self = await readSession(code);
  if (self) {
    return <RoomClient code={code} title={room.title} initialSelf={{ ...self, host: room.hostId === self.uid }} />;
  }

  return <JoinGate code={code} title={room.title} />;
}

function Gone({ title, detail }: { title: string; detail?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-ink-700 bg-ink-900 text-2xl">
        🌫️
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {detail && <p className="mt-3 text-sm leading-relaxed text-ink-400">{detail}</p>}
      <Link
        href="/"
        className="mt-7 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-soft"
      >
        Start a new room
      </Link>
    </main>
  );
}

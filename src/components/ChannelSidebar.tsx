'use client';

import { dmChannelId, type Member, type SessionClaims } from '@/lib/types';

export default function ChannelSidebar({
  open,
  members,
  me,
  activeChannel,
  unread,
  onSelectRoom,
  onSelectDm,
  onClose,
}: {
  open: boolean;
  members: Member[];
  me: SessionClaims;
  activeChannel: string;
  unread: Record<string, number>;
  onSelectRoom: () => void;
  onSelectDm: (uid: string) => void;
  onClose: () => void;
}) {
  const others = members.filter((m) => m.uid !== me.uid);

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
          aria-hidden
        />
      )}

      <aside
        className={`${
          open ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900 transition-transform md:static md:translate-x-0 md:bg-ink-900/40`}
      >
        <nav className="flex-1 overflow-y-auto p-3">
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-ink-400">
            Channel
          </p>
          <ChannelButton
            active={activeChannel === 'room'}
            unread={unread['room'] ?? 0}
            onClick={onSelectRoom}
            icon="#"
            label="everyone"
          />

          <p className="mt-5 px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-ink-400">
            Direct messages
          </p>
          {others.length === 0 ? (
            <p className="px-2 py-3 text-xs leading-relaxed text-ink-400">
              Nobody else is here yet. Share the room code and their name will
              show up — click it to start a private thread.
            </p>
          ) : (
            others.map((m) => {
              const channel = dmChannelId(me.uid, m.uid);
              return (
                <ChannelButton
                  key={m.uid}
                  active={activeChannel === channel}
                  unread={unread[channel] ?? 0}
                  onClick={() => onSelectDm(m.uid)}
                  dot={m.color}
                  label={m.name}
                />
              );
            })
          )}
        </nav>

        <div className="border-t border-ink-800 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ background: me.color }} />
            <span className="truncate text-ink-200">{me.name}</span>
            {me.host && (
              <span className="ml-auto shrink-0 rounded border border-accent/40 px-1.5 py-0.5 text-[10px] text-accent-soft">
                host
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
            Nothing here is saved. Ending the room deletes it all.
          </p>
        </div>
      </aside>
    </>
  );
}

function ChannelButton({
  active,
  unread,
  onClick,
  icon,
  dot,
  label,
}: {
  active: boolean;
  unread: number;
  onClick: () => void;
  icon?: string;
  dot?: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
        active ? 'bg-accent/15 text-ink-50' : 'text-ink-200 hover:bg-ink-800/70'
      }`}
    >
      {icon && <span className="w-3 shrink-0 text-center text-ink-400">{icon}</span>}
      {dot && <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="truncate">{label}</span>
      {unread > 0 && (
        <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

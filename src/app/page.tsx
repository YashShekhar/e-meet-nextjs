"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Avatar,
  Button,
  EmptyState,
  Icons,
  StatusPill,
} from "@/components/ui";

// Room ID: 10 chars base36 ≈ 52 bits entropy, CSPRNG only
export const ROOM_ID_REGEX = /^[A-Z0-9]{6}-[A-Z0-9]{4}$/;
export const ROOM_ID_MAX_LEN = 11; // 6 + 1 + 4

function generateSecureRoomId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  // 10 random chars → ~52 bits entropy, unpredictable (CSPRNG) — rejection sampling to avoid modulo bias (252 = 36*7)
  let id = "";
  // need 10 valid bytes in 0..251
  while (id.length < 10) {
    const bytes = new Uint8Array(10 - id.length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && id.length < 10; i++) {
      const b = bytes[i];
      if (b >= 252) continue; // reject 252-255 to avoid bias (256 % 36 !=0)
      id += alphabet[b % alphabet.length];
    }
  }
  return `${id.slice(0, 6)}-${id.slice(6)}`;
}

function normalizeRoomId(input: string): string {
  // Strict: no silent stripping — just trim + uppercase; validation will reject invalid chars
  return input.trim().toUpperCase();
}

type Recent = { id: string; at: number; role: "host" | "guest" };

function loadRecents(): Recent[] {
  try {
    const raw = localStorage.getItem("emeet_recents");
    if (!raw) return [];
    const arr = JSON.parse(raw) as Recent[];
    return Array.isArray(arr) ? arr.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is external, unreadable during SSR
    setRecents(loadRecents());
  }, []);

  const remember = (id: string, role: "host" | "guest") => {
    try {
      const next = [{ id, at: Date.now(), role }, ...loadRecents()].slice(0, 5);
      localStorage.setItem("emeet_recents", JSON.stringify(next));
    } catch {}
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    // Try up to 3 unique IDs if collision (410 deleted or 409 exists)
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = generateSecureRoomId();
      try {
        const res = await fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          // Persist host token for authenticated delete (cookie already set, localStorage fallback)
          if (data.hostToken) {
            try { localStorage.setItem(`host_token_${id}`, data.hostToken); } catch {}
          }
          remember(id, "host");
          router.push(`/room/${encodeURIComponent(id)}?host=true`);
          setTimeout(() => setCreating(false), 2000);
          return;
        }
        // 410 deleted → never reusable, generate new; 409 exists → retry
        if (res.status === 410 || res.status === 409) {
          if (attempt === 2) {
            setCreateError("That room code collided — try again.");
            setCreating(false);
            return;
          }
          continue;
        }
        setCreateError("We couldn't create the call. Check your connection and try again.");
        setCreating(false);
        return;
      } catch {
        setCreateError("We couldn't create the call. Check your connection and try again.");
        setCreating(false);
        return;
      }
    }
    setCreating(false);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const trimmed = normalizeRoomId(joinId);
    if (!trimmed) {
      setJoinError("Enter a room code to join.");
      return;
    }
    if (trimmed.length !== ROOM_ID_MAX_LEN) {
      setJoinError(`Room codes are ${ROOM_ID_MAX_LEN} characters, like A1B2CD-X9Y2.`);
      return;
    }
    if (!ROOM_ID_REGEX.test(trimmed)) {
      setJoinError("That code doesn't look right — letters, numbers and one hyphen only.");
      return;
    }
    remember(trimmed, "guest");
    router.push(`/room/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="app-shell flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-[rgba(255,255,255,0.12)] bg-[var(--action)] text-sm font-bold text-[var(--action-ink)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            E²
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-none tracking-[-0.04em]">E-Meet</p>
            <p className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <Icons.Lock size={10} /> Private
            </p>
          </div>
        </div>
        <StatusPill tone="live">Encrypted</StatusPill>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-5 px-4 pb-4 md:px-8">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="panel rise-in overflow-hidden rounded-[28px] p-5 md:p-8">
            <div className="flex items-center justify-between gap-3">
              <StatusPill tone="info" pulse>Private call</StatusPill>
              <span className="futuristic-chip inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]">
                <span className="signal-bar is-live" aria-hidden="true">
                  <span /> <span /> <span /> <span />
                </span>
                P2P
              </span>
            </div>

            <h1 className="mt-5 text-[38px] font-semibold leading-[0.96] tracking-[-0.06em] md:text-[54px]">
              Talk face to face.
              <br />
              <span className="text-[var(--text-secondary)]">Anywhere.</span>
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-6 text-[var(--text-secondary)]">
              Simple, private 1-to-1 video conversations without the clutter.
            </p>

            <div className="relative mt-7 overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--background)] p-4">
              <div className="flex aspect-[16/9] items-center justify-center gap-4 rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.01)] px-5">
                <Avatar name="A" size={58} state="live" />
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold text-white">Your room</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    Video fills the screen. Controls stay quiet until you need them.
                  </p>
                </div>
              </div>

              <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(16,16,20,0.8)] p-2 backdrop-blur-md">
                <Avatar name="Y" size={36} />
                <div className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1.5">
                  <Icons.Mic size={14} />
                  <Icons.Video size={14} />
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--danger)]">
                    <Icons.PhoneOff size={12} />
                  </span>
                </div>
              </div>

              <div className="absolute left-4 top-4">
                <StatusPill tone="live" pulse>Private</StatusPill>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
              {['No sign-up', 'P2P encrypted', 'Nothing stored'].map((item) => (
                <span key={item} className="futuristic-chip rounded-full px-3 py-1.5">
                  {item}
                </span>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-5">
            <section className="panel rounded-[24px] p-5 md:p-6">
              <h2 className="text-lg font-semibold tracking-[-0.04em]">Start a call</h2>
              <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">
                Create a private room and share the invite link. Only one person can join.
              </p>
              <Button onClick={handleCreate} disabled={creating} className="mt-5 w-full">
                {creating ? "Creating your room…" : "Start a call"}
              </Button>
              {createError && (
                <p role="alert" className="mt-3 rounded-[12px] border border-[rgba(255,95,109,0.3)] bg-[rgba(255,95,109,0.08)] px-3 py-2 text-xs text-[#ffb3bb]">
                  {createError}
                </p>
              )}
            </section>

            <section className="panel rounded-[24px] p-5 md:p-6">
              <h2 className="text-lg font-semibold tracking-[-0.04em]">Join a call</h2>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                Enter the invite code your peer shared.
              </p>
              <form onSubmit={handleJoin} className="mt-4 flex flex-col gap-3" noValidate>
                <input
                  value={joinId}
                  onChange={(e) => {
                    setJoinId(e.target.value.toUpperCase());
                    if (joinError) setJoinError(null);
                  }}
                  placeholder="e.g. A1B2CD-X9Y2"
                  maxLength={ROOM_ID_MAX_LEN}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={!!joinError}
                  aria-label="Invite code"
                  className="h-12 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 font-mono text-sm uppercase tracking-[0.2em] outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--text-muted)] focus:border-white/40"
                />
                <Button type="submit" variant="secondary" disabled={!joinId.trim()}>
                  Continue
                </Button>
              </form>
              {joinError && (
                <p role="alert" className="mt-3 text-xs leading-5 text-[#ffb3bb]">
                  {joinError}
                </p>
              )}
            </section>

            <section className="panel-soft rounded-[22px] p-4">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Recent
              </h2>
              {recents.length === 0 ? (
                <EmptyState
                  title="No recent calls"
                  body="Start a conversation and your recent calls will appear here."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {recents.map((r) => (
                    <li key={`${r.id}-${r.at}`}>
                      <button
                        onClick={() =>
                          router.push(
                            `/room/${encodeURIComponent(r.id)}${r.role === "host" ? "?host=true" : ""}`
                          )
                        }
                        className="pressable flex w-full items-center gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-white/[0.02] px-4 py-3 text-left"
                      >
                        <Avatar name={r.id} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[13px] font-semibold">{r.id}</span>
                          <span className="block text-[11px] text-[var(--text-muted)]">
                            {r.role === "host" ? "Hosted" : "Joined"} · {new Date(r.at).toLocaleDateString()}
                          </span>
                        </span>
                        <Icons.Phone size={16} className="text-[var(--text-muted)]" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <p className="mx-auto flex items-center gap-2 text-center text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <Icons.Lock size={12} />
          Media flows directly between you two and is never stored.
        </p>
      </main>

      <footer className="border-t border-[var(--border-subtle)] px-4 py-4 text-center text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] md:px-8">
        Built for private calls · <span className="text-[var(--text-secondary)]">Yash Shekhar</span>
      </footer>
    </div>
  );
}

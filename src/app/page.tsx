"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { newInviteKey } from "@/lib/callCrypto";
import { invitationFragment, parseInvitation } from "@/lib/invitation";
import {
  Avatar,
  Button,
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

export default function Home() {
  const [joinId, setJoinId] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  useEffect(() => {
    // Remove credentials and room history retained by older app versions.
    try {
      localStorage.removeItem("emeet_recents");
      Object.keys(localStorage).filter((key) => key.startsWith("host_token_")).forEach((key) => localStorage.removeItem(key));
    } catch {}
    const clearInvitation = () => flushSync(() => { setJoinId(""); setJoinError(null); });
    window.addEventListener("pagehide", clearInvitation);
    return () => window.removeEventListener("pagehide", clearInvitation);
  }, []);

  const handleCreate = () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const id = generateSecureRoomId();
      const key = newInviteKey();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- avoid retaining secrets in the client router cache
      window.location.assign(`/room/${id}?host=true#key=${key}`);
    } catch {
      setCreateError("A current browser with secure randomness is required.");
      setCreating(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    try {
      const invitation = new URL(joinId.trim());
      const secret = parseInvitation(invitation.hash);
      const id = invitation.pathname.split("/")[2] || "";
      if (invitation.origin !== window.location.origin || !ROOM_ID_REGEX.test(id)) throw new Error();
      flushSync(() => setJoinId(""));
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- discard the home page's secret-bearing input state
      window.location.assign(`/room/${id}#${invitationFragment(secret)}`);
    } catch { setJoinError("Paste the complete secret invite link from your host."); }

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
              {['No sign-up', 'End-to-end encrypted', 'Chat cleared on exit'].map((item) => (
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
                Paste the complete secret invite link your peer shared.
              </p>
              <form onSubmit={handleJoin} className="mt-4 flex flex-col gap-3" noValidate>
                <input
                  value={joinId}
                  onChange={(e) => {
                    setJoinId(e.target.value);
                    if (joinError) setJoinError(null);
                  }}
                  placeholder="https://?/room/?#key=?"
                  maxLength={512}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={!!joinError}
                  aria-label="Secret invite link"
                  className="h-12 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 font-mono text-sm outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--text-muted)] focus:border-white/40"
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

            <section className="panel-soft rounded-[22px] p-4 text-xs leading-5 text-[var(--text-secondary)]">
              Keep your invitation private. Anyone with the complete link can use its one guest slot.
              Calls expire after two hours. Messages and encryption keys are cleared when the call ends.
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

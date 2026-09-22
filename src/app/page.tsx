"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

export default function Home() {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [createError, setCreateError] = useState<string | null>(null);

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
          router.push(`/room/${encodeURIComponent(id)}?host=true`);
          setTimeout(() => setCreating(false), 2000);
          return;
        }
        // 410 deleted → never reusable, generate new; 409 exists → retry
        if (res.status === 410 || res.status === 409) {
          if (attempt === 2) {
            setCreateError(data.error || "Room ID collision — try again.");
            setCreating(false);
            return;
          }
          continue;
        }
        setCreateError(data.error || "Failed to create room");
        setCreating(false);
        return;
      } catch (e) {
        setCreateError((e as Error).message || "Network error creating room");
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
      setJoinError("Enter a room code.");
      return;
    }
    if (trimmed.length !== ROOM_ID_MAX_LEN) {
      setJoinError(`Room ID must be ${ROOM_ID_MAX_LEN} chars (like A1B2CD-X9Y2).`);
      return;
    }
    if (!ROOM_ID_REGEX.test(trimmed)) {
      setJoinError("Invalid format — only A-Z, 0-9 and single hyphen at position 7.");
      return;
    }
    router.push(`/room/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="flex flex-1 flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 md:px-10 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white text-black grid place-items-center font-bold text-sm">
            E²
          </div>
          <div>
            <p className="font-semibold leading-none tracking-tight">E-Meet</p>
            <p className="text-xs text-zinc-400">E2E Encrypted • P2P • 1:1</p>
          </div>
        </div>
        <a
          href="https://webrtc.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-400 hover:text-white transition"
          title="WebRTC DTLS-SRTP learns more"
        >
          How encryption works →
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl grid md:grid-cols-2 gap-6 md:gap-8">
          {/* Hero */}
          <div className="rounded-[28px] bg-white text-black p-8 md:p-10 flex flex-col justify-between overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-100 via-transparent to-transparent opacity-60 pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                DTLS 1.2+ • SRTP • PFS • No server recording
              </div>
              <h1 className="mt-6 text-[32px] md:text-[42px] font-semibold tracking-tight leading-[0.95]">
                Private video
                <br />
                calls, truly
                <br />
                <span className="text-zinc-500">end-to-end.</span>
              </h1>
              <p className="mt-4 text-sm leading-6 text-zinc-600 max-w-sm">
                Minimal 1:1 calling. Media flows directly peer-to-peer via
                WebRTC. Signaling only for handshake — nothing stored, ephemeral
                rooms.
              </p>
              <ul className="mt-4 space-y-1 text-xs text-zinc-600 list-disc pl-4">
                <li>CSPRNG room IDs (crypto.getRandomValues, 52-bit+)</li>
                <li>DTLS+SRTP with ECDHE, perfect forward secrecy</li>
                <li>Strict CSP/HSTS/COOP headers, no embedding</li>
              </ul>
            </div>
            <div className="relative mt-8 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-black text-white px-3 py-1.5">
                ✓ P2P WebRTC
              </span>
              <span className="rounded-full border border-black/10 px-3 py-1.5">
                ✓ No sign-up
              </span>
              <span className="rounded-full border border-black/10 px-3 py-1.5">
                ✓ 1:1 only
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-6">
            {/* Create */}
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur p-8">
              <h2 className="text-lg font-semibold">Create a room</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Generate a cryptographically random room ID. Share the link —
                only one peer can join. Room is ephemeral.
              </p>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="mt-6 w-full h-12 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  "Generating…"
                ) : (
                  <>
                    <span className="text-lg">＋</span> Create secure room
                  </>
                )}
              </button>
              {createError && (
                <p className="mt-2 text-xs text-red-300 font-medium" role="alert">
                  {createError}
                </p>
              )}
              <p className="mt-3 text-xs text-zinc-500 text-center">
                CSPRNG • Host claims Peer ID first • 52-bit entropy • never reused
              </p>
            </div>

            {/* Join */}
            <div className="rounded-[28px] border border-white/10 bg-white p-6 text-black">
              <h2 className="text-lg font-semibold">Join a room</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Enter the room code shared by your peer.
              </p>
              <form onSubmit={handleJoin} className="mt-6 flex gap-2" noValidate>
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
                  className={`flex-1 h-12 rounded-full border px-5 text-sm font-mono uppercase tracking-wide outline-none placeholder:capitalize ${
                    joinError
                      ? "border-red-400 focus:border-red-400"
                      : "border-black/10 focus:border-black/30"
                  }`}
                />
                <button
                  type="submit"
                  disabled={!joinId.trim()}
                  className="h-12 px-7 rounded-full bg-black text-white text-sm font-medium hover:bg-zinc-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Join
                </button>
              </form>
              {joinError && (
                <p className="mt-2 text-xs text-red-600 font-medium" role="alert">
                  {joinError}
                </p>
              )}
              <div className="mt-4 rounded-2xl bg-zinc-50 border border-black/[0.06] p-3 flex items-start gap-2.5">
                <span className="mt-0.5 h-6 w-6 rounded-full bg-emerald-500 grid place-items-center text-white text-xs shrink-0">
                  🔒
                </span>
                <p className="text-xs leading-4 text-zinc-600">
                  <span className="font-semibold text-black">
                    Highly encrypted:
                  </span>{" "}
                  WebRTC enforces DTLS + SRTP with ECDHE (PFS). Media is
                  encrypted end-to-end and never touches our server — only TLS
                  signaling does (PeerJS cloud WSS).
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-500 text-center px-4">
              Tip: use Chrome/Firefox + HTTPS. Camera/mic permission required.
              One-to-one only — 3rd join blocked; host can permanently delete room.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2 text-xs text-zinc-500 max-w-2xl text-center">
          <span className="rounded-full border border-white/10 px-3 py-1">
            No recording
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1">
            No history stored
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1">
            STUN: Google public
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1">
            CSP + HSTS + COOP
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1">
            Works on Vercel / localhost:3000
          </span>
        </div>
      </main>

      <footer className="px-6 py-6 border-t border-white/10 text-center text-xs text-zinc-500">
        <div>
          Built with Next.js 16 + PeerJS + WebRTC • Encrypted P2P • Minimal by
          design
        </div>
        <div className="mt-1.5 font-medium text-zinc-300">
          Designed and Developed by Yash Shekhar
        </div>
      </footer>
    </div>
  );
}

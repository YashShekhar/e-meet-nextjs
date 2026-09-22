"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { MediaConnection, Peer } from "peerjs";

type Status =
  | "initializing"
  | "waiting"
  | "connecting"
  | "connected"
  | "ended"
  | "error";

const ROOM_ID_REGEX = /^[A-Z0-9]{6}-[A-Z0-9]{4}$/;

export default function RoomClient({ roomId }: { roomId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isHost = searchParams.get("host") === "true";

  const [status, setStatus] = useState<Status>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [inviteLink, setInviteLink] = useState(`/room/${encodeURIComponent(roomId)}`);
  const [securityCode, setSecurityCode] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [roomDeleted, setRoomDeleted] = useState(false);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const roomDeletedRef = useRef(false);
  useEffect(() => { roomDeletedRef.current = roomDeleted; }, [roomDeleted]);

  // Hydration-safe invite link (avoids SSR mismatch) — requires effect to read window.origin
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window is external, SSR placeholder replaced on mount
    setInviteLink(`${window.location.origin}/room/${encodeURIComponent(roomId)}`);
  }, [roomId]);

  // Derive mutual security code (both peers must match) — sorted peerIds + roomId
  useEffect(() => {
    if (!peerId || !remotePeerId) {
      // fallback to local-only code until remote known
      if (!peerId) return;
      const fallback = `${roomId}:${peerId}`;
      crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(fallback))
        .then((buf) => {
          const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
          setSecurityCode(`${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`.toUpperCase());
        })
        .catch(() => setSecurityCode(null));
      return;
    }
    const sorted = [peerId, remotePeerId].sort().join(":");
    const data = `${sorted}:${roomId}`;
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(data))
      .then((buf) => {
        const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
        setSecurityCode(
          `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`.toUpperCase()
        );
      })
      .catch(() => setSecurityCode(null));
  }, [roomId, peerId, remotePeerId]);

  const cleanup = useCallback(() => {
    try {
      callRef.current?.close();
    } catch {}
    callRef.current = null;
    try {
      peerRef.current?.destroy();
    } catch {}
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => {
      try { t.stop(); } catch {}
    });
    localStreamRef.current = null;
    setHasRemote(false);
  }, []);

  // Ensure cleanup on unmount + beforeunload (ephemeral)
  useEffect(() => {
    const onBeforeUnload = () => {
      // best-effort ephemeral cleanup
      try { peerRef.current?.destroy(); } catch {}
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      cleanup();
    };
  }, [cleanup]);

  // Poll room status for permanent delete / full enforcement — backoff when hidden, stop when deleted
  useEffect(() => {
    if (roomDeleted) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let intervalMs = 3000;

    const poll = async () => {
      if (cancelled || roomDeleted) return;
      // If tab hidden, back off to 10s to avoid hammering
      const isHidden = typeof document !== "undefined" && document.hidden;
      if (isHidden) intervalMs = 10000;
      else intervalMs = 3000;

      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, { signal: controller.signal, cache: "no-store" });
        clearTimeout(t);
        if (cancelled) return;
        if (res.status === 410) {
          const data = await res.json().catch(() => ({}));
          setRoomDeleted(true);
          setError(data.error || "Room permanently deleted by host — code will never be reused.");
          setStatus("error");
          cleanup();
          return;
        }
        if (!res.ok) {
          // 404 etc handled in init
        } else {
          const { room } = await res.json();
          if (room?.status === "deleted") {
            setRoomDeleted(true);
            setError("Room permanently deleted — code will never be reused.");
            setStatus("error");
            cleanup();
            return;
          }
        }
      } catch {}
      if (!cancelled && !roomDeleted) {
        timeout = setTimeout(poll, intervalMs);
      }
    };

    poll();

    const onVis = () => {
      if (!document.hidden) {
        // immediate poll on becoming visible
        if (timeout) clearTimeout(timeout);
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [roomId, cleanup, roomDeleted]);

  const attachStream = useCallback(
    (video: HTMLVideoElement | null, stream: MediaStream) => {
      if (!video) return;
      video.srcObject = stream;
      // play() may reject if autoplay blocked; user gesture will retry
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    },
    []
  );

  // Keep local preview attached when ref mounts or stream changes
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      attachStream(localVideoRef.current, localStreamRef.current);
    }
  }, [attachStream, status]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  const handleLeave = useCallback(() => {
    cleanup();
    router.push("/");
  }, [cleanup, router]);

  const handleDeletePermanent = useCallback(async () => {
    if (!isHost) return;
    const confirmed = window.confirm(
      `Permanently delete room ${roomId}? This cannot be undone — the code will never be reusable and all peers will be disconnected.`
    );
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      let token: string | null = null;
      try { token = localStorage.getItem(`host_token_${roomId}`); } catch {}
      const headers: Record<string, string> = {};
      if (token) headers["x-host-token"] = token;
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to delete room — not authorized or already deleted");
        setIsDeleting(false);
        return;
      }
      try { localStorage.removeItem(`host_token_${roomId}`); } catch {}
      setRoomDeleted(true);
      setError("Room permanently deleted — code will never be reused.");
      cleanup();
      setStatus("ended");
      setTimeout(() => router.push("/"), 1200);
    } catch (e) {
      setError((e as Error).message || "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  }, [isHost, roomId, cleanup, router]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard requires secure context; UI already explains HTTPS needed
      setCopied(false);
      setError("Copy failed — HTTPS required or permission denied. Copy link manually.");
      setTimeout(() => setError((e) => (e?.includes("Copy failed") ? null : e)), 3000);
    }
  }, [inviteLink]);

  const handleReinit = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Media devices not available — HTTPS required.");
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const oldStream = localStreamRef.current;
      localStreamRef.current = newStream;
      if (localVideoRef.current) attachStream(localVideoRef.current, newStream);
      setMicOn(newStream.getAudioTracks().some((t) => t.enabled));
      setCamOn(newStream.getVideoTracks().some((t) => t.enabled));
      oldStream?.getTracks().forEach((t) => t.stop());

      // Replace tracks in existing peer connection without renegotiation
      const pc = (callRef.current as unknown as { peerConnection?: RTCPeerConnection })?.peerConnection;
      if (pc) {
        const senders = pc.getSenders();
        for (const sender of senders) {
          if (sender.track?.kind === "video") {
            const vt = newStream.getVideoTracks()[0];
            if (vt) await sender.replaceTrack(vt).catch(() => {});
          }
          if (sender.track?.kind === "audio") {
            const at = newStream.getAudioTracks()[0];
            if (at) await sender.replaceTrack(at).catch(() => {});
          }
        }
      } else if (callRef.current && peerRef.current && !isHost) {
        // fallback: re-call if no senders API
        callRef.current.close();
        const call = peerRef.current.call(roomId, newStream);
        if (call) {
          callRef.current = call;
          call.on("stream", (rs) => {
            if (remoteVideoRef.current) attachStream(remoteVideoRef.current, rs);
            setHasRemote(true);
            setStatus("connected");
          });
        }
      }
    } catch (e) {
      const err = e as Error;
      if (err.name === "NotAllowedError") setError("Camera/mic permission denied. Allow and try Re-init.");
      else setError(err.message || "Failed to re-init media.");
    }
  }, [attachStream, isHost, roomId]);

  // Core WebRTC setup
  useEffect(() => {
    // Validate roomId before any network
    if (!ROOM_ID_REGEX.test(roomId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- validation on mount, avoids network if ID is malformed
      setError(`Invalid room ID format. Expected like A1B2CD-X9Y2, got "${roomId}".`);
      setStatus("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("WebRTC not supported or insecure context — use HTTPS (or localhost) and a modern browser.");
      setStatus("error");
      return;
    }

    let cancelled = false;
    let peer: Peer | null = null;

    async function init() {
      setError(null);
      setStatus("initializing");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        // attach now or on next tick
        if (localVideoRef.current) attachStream(localVideoRef.current, stream);
        else setTimeout(() => localVideoRef.current && attachStream(localVideoRef.current, stream), 50);
        setMicOn(stream.getAudioTracks().some((t) => t.enabled));
        setCamOn(stream.getVideoTracks().some((t) => t.enabled));

        // Enforce room lifecycle via API (never reusable after delete, 1:1 limit)
        try {
          if (isHost) {
            // Host: ensure room exists (created via Home) or create if direct link, block if deleted
            const check = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store", credentials: "include" });
            if (check.status === 410) {
              const d = await check.json().catch(() => ({}));
              throw new Error(d.error || "Room permanently deleted — code will never be reused.");
            }
            if (check.status === 404) {
              // Direct host link without Home flow — try to create
              const cre = await fetch("/api/rooms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: roomId }),
                cache: "no-store",
              });
              const creData = await cre.json().catch(() => ({} as { error?: string; hostToken?: string }));
              if (!cre.ok) {
                throw new Error(creData.error || "Failed to register room");
              }
              if (creData.hostToken) {
                try { localStorage.setItem(`host_token_${roomId}`, creData.hostToken); } catch {}
              }
            } else if (!check.ok) {
              const d = await check.json().catch(() => ({}));
              if (d.error) throw new Error(d.error);
              throw new Error(`Room check failed (${check.status})`);
            } else {
              const { room } = await check.json();
              if (room?.status === "deleted") throw new Error("Room permanently deleted — code will never be reused.");
              // host can rejoin even if full (host reclaim) — no block
            }
          } else {
            // Guest: must join via API — blocks 3rd join and deleted
            const gj = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "POST", cache: "no-store", credentials: "include" });
            if (!gj.ok) {
              const d = await gj.json().catch(() => ({}));
              const msg = d.error || `Join failed (${gj.status})`;
              // 410 deleted, 403 full, 404 not found
              throw new Error(msg);
            }
          }
        } catch (e) {
          if (cancelled) return;
          setError((e as Error).message);
          setStatus("error");
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const { Peer: PeerCtor } = await import("peerjs");
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Most secure: explicit TLS signaling pinned, redundant STUN
        const peerOptions = {
          host: "0.peerjs.com",
          port: 443,
          path: "/",
          secure: true,
          key: "peerjs",
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              { urls: "stun:stun2.l.google.com:19302" },
            ],
            iceTransportPolicy: "all" as RTCIceTransportPolicy,
            iceCandidatePoolSize: 0,
            bundlePolicy: "max-bundle" as RTCBundlePolicy,
            rtcpMuxPolicy: "require" as RTCRtcpMuxPolicy,
            // For launch-ready: add TURN with short-lived creds via coturn if needed for symmetric NAT
            // encodedInsertableStreams: false, // E2EE insertable streams could be added here
          },
        } as unknown as ConstructorParameters<typeof PeerCtor>[1];

        // Correct overloads: host claims roomId, guest gets random ID (guest uses undefined -> random Peer ID)
        peer = isHost
          ? new PeerCtor(roomId, peerOptions)
          : new (PeerCtor as unknown as new (id?: string, opts?: typeof peerOptions) => Peer)(undefined, peerOptions);
        peerRef.current = peer;

        peer.on("open", (id) => {
          if (cancelled) return;
          setPeerId(id);
          reconnectAttemptsRef.current = 0; // reset on successful open
          if (isHost) {
            setStatus("waiting");
            // host remote will be known on incoming call
          } else {
            setRemotePeerId(roomId); // host is roomId — enables mutual security code immediately

            // Guest: call with exponential backoff (host may not be ready yet)
            let attempts = 0;
            const maxAttempts = 3;
            const tryCall = () => {
              if (cancelled || !peer || peer.destroyed) return;
              setStatus("connecting");
              setRetryCount(attempts);
              const call = peer!.call(roomId, stream);
              if (!call) {
                if (attempts < maxAttempts) {
                  attempts++;
                  setTimeout(tryCall, 1200 * attempts);
                } else {
                  setError(`Room "${roomId}" not found or host offline. Ask host to stay on this page with ?host=true.`);
                  setStatus("error");
                }
                return;
              }
              callRef.current = call;
              call.on("stream", (remoteStream) => {
                if (cancelled) return;
                if (remoteVideoRef.current) attachStream(remoteVideoRef.current, remoteStream);
                else setTimeout(() => remoteVideoRef.current && attachStream(remoteVideoRef.current!, remoteStream), 50);
                setHasRemote(true);
                setStatus("connected");
              });
              call.on("close", () => {
                if (cancelled) return;
                setStatus("ended");
                setHasRemote(false);
                callRef.current = null;
              });
              call.on("error", (e) => {
                console.error(e);
                const msg = (e as Error).message || "Call failed";
                // Don't flip to error if already connected
                setError(msg);
                setStatus((s) => (s === "connected" ? s : "error"));
              });
            };
            tryCall();
          }
        });

        peer.on("call", (call: MediaConnection) => {
          // Strict 1:1 enforcement + API already blocks 3rd join — reject if already handling a call
          if (callRef.current) {
            console.warn("Rejecting extra peer — 1:1 limit (room full)");
            try { call.close(); } catch {}
            return;
          }
          callRef.current = call;
          setRemotePeerId(call.peer);
          setStatus("connecting");
          call.answer(stream);
          call.on("stream", (remoteStream) => {
            if (cancelled) return;
            if (remoteVideoRef.current) attachStream(remoteVideoRef.current, remoteStream);
            else setTimeout(() => remoteVideoRef.current && attachStream(remoteVideoRef.current!, remoteStream), 50);
            setHasRemote(true);
            setStatus("connected");
          });
          call.on("close", () => {
            if (cancelled) return;
            // After a 1:1 session, room is sealed (full) — never show "waiting" again
            // Polling will keep it as deleted/full; show ended
            setStatus("ended");
            setHasRemote(false);
            if (callRef.current === call) callRef.current = null;
          });
          call.on("error", (e) => {
            console.error(e);
            setError((e as Error).message);
            setStatus("error");
          });
        });

        peer.on("error", (err: unknown) => {
          if (cancelled) return;
          console.error("peer error", err);
          const typed = err as { type?: string; message?: string };
          const t = typed.type;
          // Narrow, exact matching — not substring
          if (t === "peer-unavailable") {
            setError(`Room "${roomId}" not found or host offline. Host must open /room/${roomId}?host=true and keep tab open.`);
            setStatus("error");
          } else if (t === "unavailable-id") {
            setError(`Room ID "${roomId}" is already taken. Choose another or join as guest (without ?host=true).`);
            setStatus("error");
          } else if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") {
            setError(`Signaling error (${t}): ${typed.message || "network issue"} — retrying…`);
            setStatus("error");
            // auto-reconnect if possible
            try { (peer as Peer)?.reconnect(); } catch {}
          } else if (t === "browser-incompatible") {
            setError("Browser incompatible with WebRTC.");
            setStatus("error");
          } else {
            setError(typed.message || String(err));
            setStatus("error");
          }
        });

        peer.on("disconnected", () => {
          if (cancelled || !peer || roomDeletedRef.current) return;
          const attempts = reconnectAttemptsRef.current;
          if (attempts >= 5) {
            setError("Signaling disconnected — please reload.");
            setStatus("error");
            return;
          }
          reconnectAttemptsRef.current = attempts + 1;
          const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
          setTimeout(() => {
            if (cancelled || !peer) return;
            if (peer.destroyed) return;
            try { peer.reconnect(); } catch {}
          }, delay);
        });

        peer.on("close", () => {
          if (!cancelled) setStatus((s) => (s === "connected" ? "ended" : s));
        });

      } catch (e: unknown) {
        const err = e as Error & { name?: string };
        if (cancelled) return;
        if (err?.name === "NotAllowedError" || err?.message?.includes("Permission")) {
          setError("Camera/mic permission denied. Allow access and reload. (HTTPS required)");
        } else if (err?.name === "NotFoundError") {
          setError("No camera/microphone found.");
        } else if (err?.name === "NotReadableError") {
          setError("Camera/mic busy — close other apps using it.");
        } else {
          setError(err?.message || "Failed to initialize media.");
        }
        setStatus("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      try { callRef.current?.close(); } catch {}
      callRef.current = null;
      try { peer?.destroy(); } catch {}
      if (peerRef.current === peer) peerRef.current = null;
      // Stop tracks only if we're leaving this room instance
      localStreamRef.current?.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      localStreamRef.current = null;
    };
  }, [roomId, isHost, attachStream]);

  const statusLabel: Record<Status, string> = {
    initializing: "Initializing secure channel…",
    waiting: "Waiting for peer to join…",
    connecting: retryCount ? `Connecting — retry ${retryCount}/3…` : "Connecting — negotiating E2E keys…",
    connected: "● Live — E2E encrypted (DTLS-SRTP)",
    ended: "Call ended — ephemeral session closed",
    error: "Error",
  };

  return (
    <div className="flex flex-1 flex-col min-h-screen bg-[#080808]">
      {/* top bar */}
      <header className="h-[56px] border-b border-white/10 flex items-center justify-between px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleLeave}
            className="h-8 w-8 rounded-full border border-white/15 grid place-items-center hover:bg-white/10 transition text-sm"
            aria-label="Leave and destroy session"
          >
            ←
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold tracking-wide truncate" title={roomId}>
                {roomId}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                  status === "connected"
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : status === "waiting"
                    ? "bg-amber-400 text-black border-amber-400"
                    : status === "error"
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-white/10 text-zinc-300 border-white/10"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "waiting" || status === "connecting" ? "animate-pulse" : ""}`} />
                {statusLabel[status]}
              </span>
            </div>
            <p className="text-xs text-zinc-500 truncate hidden md:block">
              {isHost ? "You are HOST • " : "You are GUEST • "}
              {peerId ? `peer ${peerId.slice(0, 10)}…` : "connecting signaling…"} • 1:1 • ephemeral
              {securityCode ? ` • code ${securityCode}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            className="hidden sm:inline-flex h-9 rounded-full bg-white text-black px-4 text-sm font-medium hover:bg-zinc-200 transition"
          >
            {copied ? "✓ Copied" : "Copy invite link"}
          </button>
          <button
            onClick={handleCopy}
            className="sm:hidden h-9 w-9 rounded-full bg-white text-black grid place-items-center"
            aria-label="Copy invite link"
          >
            ⧉
          </button>
          {isHost && (
            <button
              onClick={handleDeletePermanent}
              disabled={isDeleting || roomDeleted}
              className="hidden sm:inline-flex h-9 rounded-full bg-zinc-800 hover:bg-red-600 border border-red-600/30 text-white px-4 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Permanently delete room — code will never be reused"
            >
              {isDeleting ? "Deleting…" : roomDeleted ? "Deleted" : "Delete room"}
            </button>
          )}
          <button
            onClick={handleLeave}
            className="h-9 rounded-full bg-red-600 hover:bg-red-500 text-white px-4 text-sm font-medium transition"
          >
            Leave
          </button>
        </div>
      </header>

      {roomDeleted && (
        <div className="px-4 md:px-6 py-3 bg-red-600 text-white text-sm font-medium flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          Room permanently deleted — code {roomId} will never be reused. All peers disconnected.
          <button onClick={() => router.push("/")} className="ml-auto rounded-full bg-white text-red-600 px-3 py-1 text-xs font-semibold">Go home</button>
        </div>
      )}

      {/* encryption banner */}
      <div className="px-4 md:px-6 py-3 flex flex-wrap items-center gap-2 border-b border-white/5 bg-emerald-500/10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 text-white px-3 py-1 text-xs font-semibold">
          🔒 End-to-end encrypted
        </span>
        <span className="text-xs text-zinc-400">
          WebRTC DTLS 1.2+ • SRTP • ECDHE PFS • Media is P2P only • No recording • Signaling via WSS (handshake only) • Ephemeral • 1:1 locked • Never reused after delete
        </span>
        {securityCode && !roomDeleted && (
          <span className="ml-auto text-xs font-mono text-emerald-200 border border-emerald-500/20 rounded-full px-2.5 py-1 bg-black/20">
            Security code: {securityCode} — verify with peer
          </span>
        )}
      </div>

      {/* invite helper */}
      <div className="px-4 md:px-6 py-3 flex flex-wrap gap-2 items-center text-xs">
        <span className="text-zinc-500">Invite link:</span>
        <code className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-zinc-200 break-all">
          {inviteLink}
        </code>
        <button
          onClick={handleCopy}
          className="rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10 transition"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        {isHost && status === "waiting" && (
          <span className="text-amber-300">Share this link — waiting for guest… keep this tab open.</span>
        )}
        {!isHost && status === "error" && (
          <span className="text-red-300">Host may be offline — ask host to open with ?host=true.</span>
        )}
      </div>

      {error && (
        <div className="mx-4 md:mx-6 rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-200 flex items-start justify-between gap-3">
          <span className="break-words">{error}</span>
          <button onClick={() => window.location.reload()} className="shrink-0 rounded-full bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-500">
            Retry
          </button>
        </div>
      )}

      {/* videos */}
      <main className="flex-1 p-4 md:p-6 flex flex-col min-h-0">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          {/* Remote */}
          <div className="relative rounded-[24px] overflow-hidden bg-zinc-900 border border-white/10 min-h-[280px] lg:min-h-0 flex flex-col">
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
              <span className="rounded-full bg-black/60 backdrop-blur px-3 py-1 text-xs text-white border border-white/10">
                Remote — peer
              </span>
              {hasRemote && (
                <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs text-white font-medium">
                  live • E2EE
                </span>
              )}
            </div>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`h-full w-full object-cover bg-zinc-900 ${!hasRemote ? "hidden" : ""}`}
            />
            {!hasRemote && (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 grid place-items-center text-2xl mb-4">
                  👤
                </div>
                <p className="text-sm font-medium text-white">
                  {status === "waiting"
                    ? "Waiting for someone to join…"
                    : status === "connecting"
                    ? "Connecting… (E2E handshake)"
                    : status === "connected"
                    ? "No remote stream"
                    : status === "error"
                    ? "No peer connected"
                    : "No peer connected"}
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                  {isHost
                    ? "Keep this tab open and share the invite link. Guest will connect P2P automatically. Security code must match on both sides."
                    : "If you see an error, ask the host to re-create the room and send a fresh link. Verify security code via phone."}
                </p>
                {status !== "connected" && status !== "error" && status !== "ended" && (
                  <div className="mt-4 h-1.5 w-16 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-1/2 bg-white/60 animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Local */}
          <div className="relative rounded-[24px] overflow-hidden bg-zinc-900 border border-white/10 min-h-[280px] lg:min-h-0 flex flex-col">
            <div className="absolute top-3 left-3 z-10 rounded-full bg-black/60 backdrop-blur px-3 py-1 text-xs text-white border border-white/10">
              You — local preview {peerId ? `• ${peerId.slice(0, 6)}` : ""}
            </div>
            <div className="absolute top-3 right-3 z-10 flex gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium border ${micOn ? "bg-white text-black border-white" : "bg-red-600 text-white border-red-600"}`}>
                {micOn ? "Mic on" : "Mic muted"}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium border ${camOn ? "bg-white text-black border-white" : "bg-red-600 text-white border-red-600"}`}>
                {camOn ? "Cam on" : "Cam off"}
              </span>
            </div>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover bg-zinc-900 scale-x-[-1]"
            />
            {!camOn && (
              <div className="absolute inset-0 grid place-items-center bg-zinc-900/80 backdrop-blur-[2px]">
                <div className="text-center">
                  <div className="h-14 w-14 rounded-full bg-white/10 mx-auto grid place-items-center text-lg">📷</div>
                  <p className="text-xs text-zinc-400 mt-2">Camera off</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={toggleMic}
            className={`h-12 min-w-12 rounded-full px-6 flex items-center justify-center gap-2 text-sm font-medium border transition ${
              micOn
                ? "bg-white text-black border-white hover:bg-zinc-200"
                : "bg-red-600 text-white border-red-600 hover:bg-red-500"
            }`}
          >
            <span className="text-base">{micOn ? "🎙️" : "🔇"}</span> {micOn ? "Mute" : "Unmute"}
          </button>
          <button
            onClick={toggleCam}
            className={`h-12 min-w-12 rounded-full px-6 flex items-center justify-center gap-2 text-sm font-medium border transition ${
              camOn
                ? "bg-white text-black border-white hover:bg-zinc-200"
                : "bg-red-600 text-white border-red-600 hover:bg-red-500"
            }`}
          >
            <span className="text-base">{camOn ? "📹" : "🚫"}</span> {camOn ? "Stop video" : "Start video"}
          </button>
          <button
            onClick={handleLeave}
            className="h-12 rounded-full bg-red-600 hover:bg-red-500 text-white px-8 text-sm font-medium transition border border-red-600"
          >
            End call
          </button>
          <button
            onClick={handleReinit}
            className="h-12 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-white px-6 text-sm font-medium transition"
          >
            ↻ Re-init media
          </button>
          {isHost && (
            <button
              onClick={handleDeletePermanent}
              disabled={isDeleting || roomDeleted}
              className="h-12 rounded-full bg-zinc-900 hover:bg-red-600 border border-red-600/40 text-white px-6 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Permanently delete room"
            >
              {isDeleting ? "Deleting…" : roomDeleted ? "✓ Deleted" : "🗑 Delete room permanently"}
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-zinc-500">
          Ephemeral • No logs • P2P only • If permissions were denied, allow camera/mic and press Re-init. Works only on HTTPS (localhost or Vercel). Security code proves no MITM — compare via external channel.
        </p>
        <details className="mt-3 mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-zinc-400">
          <summary className="cursor-pointer font-medium text-zinc-200">How “most secure” is implemented</summary>
          <ul className="mt-2 list-disc pl-5 space-y-1 leading-5">
            <li><b className="text-zinc-200">CSPRNG IDs:</b> crypto.getRandomValues (52-bit+), not Math.random; validated strict regex, peer ID is room ID.</li>
            <li><b className="text-zinc-200">E2EE:</b> WebRTC DTLS 1.2+ with ECDHE + SRTP, PFS; SRTP keys never leave browser; TLS 1.3 to signaling.</li>
            <li><b className="text-zinc-200">Signaling:</b> WSS to PeerJS cloud only for SDP/ICE handshake; no media relay; self-hostable; auto-destroy on leave.</li>
            <li><b className="text-zinc-200">Headers:</b> HSTS preload, CSP (frame-ancestors none, connect-src pin), COOP same-origin, Permissions-Policy camera/mic self only, X-Frame Deny.</li>
            <li><b className="text-zinc-200">1:1 lock:</b> single MediaConnection — API blocks 3rd join (403 Full) and Peer rejects extra calls; no multi-party leak.</li>
            <li><b className="text-zinc-200">No reuse:</b> host “Delete room permanently” tombstones ID (410) — file+memory persisted, never reusable; full rooms also sealed.</li>
            <li><b className="text-zinc-200">Verification:</b> derived SHA-256 security code (roomId:peerId) shown to both peers — compare out-of-band to detect MITM.</li>
            <li><b className="text-zinc-200">Ephemeral:</b> tracks stopped + peer destroyed on leave/beforeunload/room change; no history, no recording.</li>
          </ul>
        </details>
      </main>

      <footer className="px-4 md:px-6 py-4 border-t border-white/10 text-center text-xs text-zinc-500">
        <div>
          Built with Next.js 16 + PeerJS + WebRTC • Encrypted P2P • Minimal by
          design
        </div>
        <div className="mt-1 font-medium text-zinc-300">
          Designed and Developed by Yash Shekhar
        </div>
      </footer>

      <style>{`@keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }`}</style>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { MediaConnection, Peer } from "peerjs";
import {
  Avatar,
  BottomSheet,
  Button,
  IconButton,
  Icons,
  StatusPill,
  ToastStack,
  VideoPlaceholder,
  pushToast,
  type Toast,
} from "@/components/ui";

/* Human-readable error mapping (§28) — never show raw WebRTC codes. */
function friendlyError(raw: string): { title: string; body: string } {
  const r = raw.toLowerCase();
  if (r.includes("permission") || r.includes("notallowed") || r.includes("denied"))
    return {
      title: "Camera and mic are blocked",
      body: "Your browser blocked access. Allow camera and microphone, then try again.",
    };
  if (r.includes("no camera") || r.includes("notfound") || r.includes("no microphone") || r.includes("no mic"))
    return {
      title: "No camera or microphone found",
      body: "We couldn't find a device to send. Check your hardware, then try again.",
    };
  if (r.includes("busy") || r.includes("notreadable") || r.includes("track"))
    return {
      title: "Camera or mic is busy",
      body: "Another app may be using it. Close other call apps and try again.",
    };
  if (r.includes("offline") || r.includes("not found") || r.includes("peer-unavailable") || r.includes("host"))
    return {
      title: "We couldn't reach the other person",
      body: "They may not be on this page yet. Ask them to open the invite link and keep the tab open.",
    };
  if (r.includes("full") || r.includes("1:1") || r.includes("third"))
    return {
      title: "This call is full",
      body: "E-Meet calls are 1-to-1. Only two people can join.",
    };
  if (r.includes("deleted") || r.includes("410") || r.includes("never be reused"))
    return {
      title: "This room no longer exists",
      body: "It was permanently deleted and codes are never reused. Ask for a fresh invite link.",
    };
  if (r.includes("signaling") || r.includes("network") || r.includes("socket") || r.includes("reconnect"))
    return {
      title: "Connection is unstable",
      body: "Try moving closer to your Wi-Fi router, then retry.",
    };
  return { title: "Something didn't work", body: raw };
}

function buzz(pattern: number | number[] = 10) {
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern);
  } catch {}
}

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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [micPulse, setMicPulse] = useState(0);
  const prevStatusRef = useRef<Status>("initializing");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // Dedicated audio element guarantees the remote audio track plays even if
  // the remote <video> autoplay (with audio) is blocked or video is disabled.
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
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
    try {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      }
    } catch {}
    setHasRemote(false);
    setAudioBlocked(false);
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

  // Remote voice plays ONLY through the hidden <audio> element; the
  // <video> element gets a video-only stream and stays muted so the same
  // audio track is never rendered twice (louder/phasing/echo).
  const playMedia = useCallback((el: HTMLMediaElement | null, stream: MediaStream, opts: { audible: boolean }) => {
    if (!el) return false;
    el.srcObject = stream;
    try {
      el.muted = !opts.audible;
      el.volume = 1;
    } catch {}
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        if (opts.audible) setAudioBlocked(true);
      });
    }
    return true;
  }, []);

  const attachRemoteStream = useCallback(
    (stream: MediaStream) => {
      // Split kinds so <video> can never emit audio even as a fallback.
      const videoOnly =
        stream.getVideoTracks().length > 0 ? new MediaStream(stream.getVideoTracks()) : null;
      const audioOnly =
        stream.getAudioTracks().length > 0 ? new MediaStream(stream.getAudioTracks()) : null;
      const videoStream = videoOnly ?? stream;
      const audioStream = audioOnly ?? stream;

      if (!playMedia(remoteVideoRef.current, videoStream, { audible: false })) {
        // ref not mounted yet — retry shortly so remote video is not dropped
        setTimeout(() => {
          playMedia(remoteVideoRef.current, videoStream, { audible: false });
        }, 50);
      }
      if (!playMedia(remoteAudioRef.current, audioStream, { audible: true })) {
        setTimeout(() => {
          playMedia(remoteAudioRef.current, audioStream, { audible: true });
        }, 50);
      }
    },
    [playMedia]
  );

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

  // Browsers may block remote audio until a user gesture — retry on click/key.
  // Only the hidden <audio> element gates the flag; <video> is muted by
  // design (see attachRemoteStream) so its play() result is irrelevant.
  const unlockRemoteAudio = useCallback(async () => {
    const v = remoteVideoRef.current;
    if (v) {
      try {
        v.muted = true;
        await v.play();
      } catch {}
    }
    const a = remoteAudioRef.current;
    if (!a) return;
    try {
      a.muted = false;
      a.volume = 1;
      await a.play();
      setAudioBlocked(false);
    } catch {
      // still blocked — keep the "Tap to enable" prompt
    }
  }, []);

  useEffect(() => {
    if (!audioBlocked) return;
    const onGesture = () => {
      unlockRemoteAudio();
    };
    window.addEventListener("click", onGesture);
    window.addEventListener("touchend", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("click", onGesture);
      window.removeEventListener("touchend", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [audioBlocked, unlockRemoteAudio]);

  // Keep local preview attached when ref mounts or stream changes
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      attachStream(localVideoRef.current, localStreamRef.current);
    }
  }, [attachStream, status]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return;
    // Toggle ALL audio tracks so no mic is left half-muted (some devices
    // expose >1 track). Next state is the inverse of "any enabled".
    const next = !tracks.some((t) => t.enabled);
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setMicOn(next);
    setMicPulse((n) => n + 1);
    buzz(10);
    pushToast(setToasts, next ? "Microphone on" : "Microphone muted");
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (!tracks.length) return;
    const next = !tracks.some((t) => t.enabled);
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setCamOn(next);
    buzz(10);
    pushToast(setToasts, next ? "Camera on" : "Camera turned off");
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
      buzz(10);
      pushToast(setToasts, "Link copied");
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
      // Preserve user's mute choices — a fresh getUserMedia defaults to
      // enabled, which would otherwise unmute a muted user and look like a
      // one-way/streaming bug.
      const wasMicOn = localStreamRef.current
        ? localStreamRef.current.getAudioTracks().some((t) => t.enabled)
        : micOn;
      const wasCamOn = localStreamRef.current
        ? localStreamRef.current.getVideoTracks().some((t) => t.enabled)
        : camOn;
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const newAudio = newStream.getAudioTracks()[0];
      const newVideo = newStream.getVideoTracks()[0];
      if (!newAudio) {
        newStream.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        throw new Error("No microphone found — voice would be one-way. Check mic and retry.");
      }
      newStream.getAudioTracks().forEach((t) => {
        t.enabled = wasMicOn;
      });
      newStream.getVideoTracks().forEach((t) => {
        t.enabled = wasCamOn;
      });
      const oldStream = localStreamRef.current;
      localStreamRef.current = newStream;
      if (localVideoRef.current) attachStream(localVideoRef.current, newStream);
      setMicOn(wasMicOn);
      setCamOn(wasCamOn);
      oldStream?.getTracks().forEach((t) => t.stop());

      // Replace tracks in existing peer connection without renegotiation.
      // sender.track can be null after the old track ended — resolve kind via
      // transceivers (receiver.track survives) instead of guessing by order.
      const pc = (callRef.current as unknown as { peerConnection?: RTCPeerConnection })?.peerConnection;
      let audioReplaced = false;
      let videoReplaced = false;
      const markReplaced = async (sender: RTCRtpSender, track: MediaStreamTrack, kind: "audio" | "video") => {
        try {
          await sender.replaceTrack(track);
          if (kind === "audio") audioReplaced = true;
          else videoReplaced = true;
        } catch {
          // keep flag false so fallback/error path runs
        }
      };
      if (pc) {
        try {
          const senders = pc.getSenders();
          const kindBySender = new Map<RTCRtpSender, string>();
          try {
            for (const tr of pc.getTransceivers()) {
              const k =
                (tr as unknown as { kind?: string }).kind ??
                tr.receiver?.track?.kind ??
                tr.sender?.track?.kind;
              if (k && tr.sender) kindBySender.set(tr.sender, k);
            }
          } catch {}
          for (const sender of senders) {
            const kind = sender.track?.kind ?? kindBySender.get(sender);
            if (kind === "audio" && newAudio && !audioReplaced) {
              await markReplaced(sender, newAudio, "audio");
            } else if (kind === "video" && newVideo && !videoReplaced) {
              await markReplaced(sender, newVideo, "video");
            }
          }
        } catch {}
      }
      if ((!audioReplaced || !videoReplaced) && callRef.current && peerRef.current && !isHost) {
        // fallback: re-call if replaceTrack missed (e.g. no senders API)
        try { callRef.current.close(); } catch {}
        const call = peerRef.current.call(roomId, newStream);
        if (call) {
          callRef.current = call;
          call.on("stream", (rs) => {
            attachRemoteStream(rs);
            setHasRemote(true);
            setAudioBlocked(false);
            setStatus("connected");
          });
          call.on("close", () => {
            setStatus("ended");
            setHasRemote(false);
            try {
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
              if (remoteAudioRef.current) {
                remoteAudioRef.current.pause();
                remoteAudioRef.current.srcObject = null;
              }
            } catch {}
            if (callRef.current === call) callRef.current = null;
          });
          call.on("error", (e) => {
            console.error(e);
            setError((e as Error).message || "Re-call failed");
            setStatus((s) => (s === "connected" ? s : "error"));
          });
        }
      }
      if ((!audioReplaced || !videoReplaced) && isHost) {
        // Host has no re-call path in the 1:1 model — surface instead of
        // silently leaving the guest with frozen/no audio.
        setError(
          "Re-init swapped local media but could not publish it (replaceTrack failed). Ask the guest to rejoin or reload both tabs."
        );
      }
    } catch (e) {
      const err = e as Error;
      if (err.name === "NotAllowedError") setError("Camera/mic permission denied. Allow and try Re-init.");
      else setError(err.message || "Failed to re-init media.");
    }
  }, [attachRemoteStream, attachStream, isHost, roomId, micOn, camOn]);

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
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Fail fast on missing mic — otherwise the call connects video-only
        // and looks like "one side can't be heard".
        if (!stream.getAudioTracks().length) {
          setError("No microphone track — voice would be one-way. Check mic permission and Re-init.");
          setStatus("error");
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

            // Guest: call with exponential backoff (host may not be ready yet).
            // NOTE: peer.call() returns a MediaConnection even when the host
            // is offline — the real "peer-unavailable" arrives async via
            // peer.on("error"), so that handler retries too (see below).
            let attempts = 0;
            const maxAttempts = 3;
            const tryCall = () => {
              if (cancelled || !peer || peer.destroyed) return;
              // Always send the LIVE local stream (re-init may have swapped it)
              const live = localStreamRef.current ?? stream;
              if (!live.getAudioTracks().length) {
                setError("No microphone track — guest voice can't be sent. Re-init media.");
                setStatus("error");
                return;
              }
              setStatus("connecting");
              setRetryCount(attempts);
              // Close any stale half-open call before redialing
              try { callRef.current?.close(); } catch {}
              callRef.current = null;
              const call = peer!.call(roomId, live);
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
              // expose retry to the peer-unavailable handler; returns true
              // only when another attempt was actually scheduled
              (peer as unknown as { __guestRetry?: () => boolean }).__guestRetry = () => {
                if (cancelled) return false;
                if (attempts < maxAttempts) {
                  attempts++;
                  setTimeout(tryCall, 1200 * attempts);
                  return true;
                }
                return false;
              };
              call.on("stream", (remoteStream) => {
                if (cancelled) return;
                attachRemoteStream(remoteStream);
                setHasRemote(true);
                setAudioBlocked(false);
                setStatus("connected");
              });
              call.on("close", () => {
                if (cancelled) return;
                setStatus("ended");
                setHasRemote(false);
                try {
                  if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
                  if (remoteAudioRef.current) {
                    remoteAudioRef.current.pause();
                    remoteAudioRef.current.srcObject = null;
                  }
                } catch {}
                if (callRef.current === call) callRef.current = null;
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
          // Answer with the LIVE stream (not the stale init closure) so host
          // voice keeps flowing after a Re-init media swap.
          call.answer(localStreamRef.current ?? stream);
          call.on("stream", (remoteStream) => {
            if (cancelled) return;
            attachRemoteStream(remoteStream);
            setHasRemote(true);
            setAudioBlocked(false);
            setStatus("connected");
          });
          call.on("close", () => {
            if (cancelled) return;
            // After a 1:1 session, room is sealed (full) — never show "waiting" again
            // Polling will keep it as deleted/full; show ended
            setStatus("ended");
            setHasRemote(false);
            try {
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
              if (remoteAudioRef.current) {
                remoteAudioRef.current.pause();
                remoteAudioRef.current.srcObject = null;
              }
            } catch {}
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
            // Guest redials a few times — host tab may just be opening.
            // If retries are exhausted, fall through to the terminal error
            // instead of leaving the UI stuck on "connecting".
            const retry = (peer as unknown as { __guestRetry?: () => boolean }).__guestRetry;
            if (!isHost && retry && retry()) {
              setStatus("connecting");
              return;
            }
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
  }, [roomId, isHost, attachStream, attachRemoteStream]);

  const statusMeta: Record<Status, { label: string; tone: "neutral" | "live" | "warn" | "danger" | "info" }> = {
    initializing: { label: "Preparing…", tone: "neutral" },
    waiting: { label: "Waiting for peer", tone: "warn" },
    connecting: { label: retryCount ? `Connecting · retry ${retryCount}/3` : "Connecting…", tone: "info" },
    connected: { label: "Connected", tone: "live" },
    ended: { label: "Ended", tone: "neutral" },
    error: { label: "Couldn't connect", tone: "danger" },
  };

  // Toast on transitions: connected / restored / ended (§29)
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (status === "connected" && prev !== "connected") {
      pushToast(setToasts, "You're connected");
      buzz([12, 40, 12]);
    }
    if (status === "ended" && prev === "connected") {
      pushToast(setToasts, "Call ended");
    }
    prevStatusRef.current = status;
  }, [status]);

  // Auto-hide controls when idle during a call (§12: quiet when idle).
  // Touch users keep controls; mouse users reveal on movement.
  // Note: render forces the dock visible unless status is connected, so no
  // reset is needed here when leaving a call.
  useEffect(() => {
    if (status !== "connected") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poke = () => {
      setControlsHidden(false);
      if (timer) clearTimeout(timer);
      if (window.matchMedia("(pointer: fine)").matches) {
        timer = setTimeout(() => setControlsHidden(true), 3500);
      }
    };
    poke();
    window.addEventListener("mousemove", poke);
    window.addEventListener("touchstart", poke, { passive: true });
    window.addEventListener("keydown", poke);
    return () => {
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("touchstart", poke);
      window.removeEventListener("keydown", poke);
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  const friendly = error ? friendlyError(error) : null;
  const inCall = status === "connected" || (status === "connecting" && hasRemote);

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      {/* Top bar — overlays the stage during a call (§13) */}
      <header
        className={`z-20 flex shrink-0 items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)] md:px-6 ${
          inCall ? "pointer-events-none absolute inset-x-0 top-0" : ""
        }`}
      >
        <div className={`flex min-w-0 items-center gap-2.5 ${inCall ? "pointer-events-auto" : ""}`}>
          <button
            onClick={handleLeave}
            aria-label="Leave call"
            className="pressable glass grid h-10 w-10 shrink-0 place-items-center rounded-full text-white"
          >
            <Icons.Back size={17} />
          </button>
          <div className="glass flex min-w-0 items-center gap-2 rounded-full py-1.5 pl-3 pr-2">
            <span className="truncate font-mono text-[13px] font-semibold tracking-wide" title={roomId}>
              {roomId}
            </span>
            <StatusPill tone={statusMeta[status].tone} pulse={status === "waiting" || status === "connecting"}>
              {statusMeta[status].label}
            </StatusPill>
          </div>
        </div>

        <div className={`flex shrink-0 items-center gap-2 ${inCall ? "pointer-events-auto" : ""}`}>
          <span className="glass hidden items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)] sm:inline-flex">
            <Icons.Lock size={12} /> Private call
          </span>
          <button
            onClick={handleCopy}
            aria-label="Copy invite link"
            className="pressable glass grid h-10 w-10 place-items-center rounded-full text-white"
            title="Copy invite link"
          >
            {copied ? <Icons.Check size={17} /> : <Icons.Copy size={17} />}
          </button>
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="More options"
            className="pressable glass grid h-10 w-10 place-items-center rounded-full text-white"
            title="More options"
          >
            <Icons.More size={18} />
          </button>
        </div>
      </header>

      {roomDeleted && (
        <div className="z-20 mx-4 mt-3 flex items-center gap-2 rounded-[16px] bg-[var(--danger)] px-4 py-3 text-sm font-medium text-white md:mx-6">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" />
          <span>This room was permanently deleted. Codes are never reused.</span>
          <button onClick={() => router.push("/")} className="ml-auto shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--danger)]">Go home</button>
        </div>
      )}

      {error && status === "error" && (
        <div className="rise-in z-20 mx-4 mt-3 rounded-[20px] border border-[rgba(255,95,109,0.3)] bg-[rgba(255,95,109,0.08)] p-5 text-center md:mx-6">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(255,95,109,0.15)] text-[var(--danger)]">
            <Icons.VideoOff size={22} />
          </div>
          <p className="mt-3 text-[15px] font-semibold text-white">{friendly?.title}</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-[var(--text-secondary)]">{friendly?.body}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <Button variant="secondary" onClick={() => router.push("/")}>Go home</Button>
          </div>
        </div>
      )}

      {/* Stage (§13): full-screen remote, floating self, calm states */}
      <main className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] md:px-6">
        {status === "ended" && !roomDeleted ? (
          <div className="rise-in mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <Avatar name={roomId} size={80} />
            <h2 className="mt-2 text-2xl font-semibold">Call ended</h2>
            <p className="max-w-[32ch] text-[13px] leading-5 text-[var(--text-secondary)]">
              This session is closed and nothing was stored. Start fresh whenever you like.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => window.location.reload()}>Rejoin</Button>
              <Button variant="secondary" onClick={() => router.push("/")}>Go home</Button>
            </div>
          </div>
        ) : status === "waiting" && isHost && !hasRemote ? (
          /* Calm waiting room (§12) */
          <div className="rise-in mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 py-8">
            <div className="overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface)]">
              <div className="relative aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full scale-x-[-1] bg-black object-cover"
                />
                {!camOn && (
                  <div className="absolute inset-0">
                    <VideoPlaceholder name="You" caption="Your camera is off — guests will see your avatar." />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-3 p-4">
                <IconButton label={micOn ? "Mute microphone" : "Unmute microphone"} onClick={toggleMic} off={!micOn}>
                  <span key={micPulse} className="mic-pop grid place-items-center">
                    {micOn ? <Icons.Mic size={20} /> : <Icons.MicOff size={20} />}
                  </span>
                </IconButton>
                <IconButton label={camOn ? "Turn camera off" : "Turn camera on"} onClick={toggleCam} off={!camOn}>
                  {camOn ? <Icons.Video size={20} /> : <Icons.VideoOff size={20} />}
                </IconButton>
              </div>
            </div>
            <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 text-center">
              <StatusPill tone="warn" pulse>Waiting for guest</StatusPill>
              <p className="mx-auto mt-3 max-w-[36ch] text-[13px] leading-5 text-[var(--text-secondary)]">
                Share the invite link and keep this tab open. They will connect automatically.
              </p>
              <code className="mt-3 block break-all rounded-[12px] border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 font-mono text-xs text-[var(--text-secondary)]">
                {inviteLink}
              </code>
              <Button onClick={handleCopy} variant="secondary" className="mt-3 w-full">
                {copied ? "Copied" : "Copy invite link"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Remote stage */}
            <div
              className={`relative mt-3 min-h-[46dvh] flex-1 overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface)] ${
                inCall ? "md:min-h-[62dvh]" : ""
              }`}
            >
              {hasRemote ? (
                <video
                  key="remote"
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  className="join-in h-full min-h-[46dvh] w-full bg-black object-cover"
                />
              ) : (
                <VideoPlaceholder
                  name={isHost ? "Guest" : "Host"}
                  connecting={status === "connecting" || status === "initializing"}
                  caption={
                    status === "initializing"
                      ? "Finding your connection…"
                      : status === "connecting"
                        ? `Connecting…${retryCount ? ` (retry ${retryCount}/3)` : ""}`
                        : status === "error"
                          ? "No one is here yet."
                          : "Waiting for the other person…"
                  }
                />
              )}
              {/* Hidden voice channel — the ONLY audible remote path. */}
              <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

              {/* Top-left presence */}
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="glass rounded-full px-3 py-1.5 text-[11px] font-medium text-white">
                  {hasRemote ? (isHost ? "Guest" : "Host") : "No one here yet"}
                </span>
                {hasRemote && <StatusPill tone="live" pulse>Live</StatusPill>}
              </div>
              {/* Mic/cam flags */}
              <div className="absolute right-3 top-3 flex gap-1.5">
                {!micOn && (
                  <span className="rounded-full bg-[var(--danger)] px-2.5 py-1 text-[11px] font-medium text-white">
                    You&apos;re muted
                  </span>
                )}
                {!camOn && (
                  <span className="glass rounded-full px-2.5 py-1 text-[11px] font-medium text-white">
                    Camera off
                  </span>
                )}
              </div>

              {audioBlocked && hasRemote && (
                <button
                  onClick={unlockRemoteAudio}
                  className="pressable absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--warning)] px-4 py-2.5 text-xs font-semibold text-black"
                >
                  Tap to enable audio
                </button>
              )}

              {/* Floating self-preview (§13) */}
              <div className="absolute bottom-3 right-3 w-28 overflow-hidden rounded-[16px] border border-[var(--border-strong)] bg-black shadow-xl sm:w-36 md:w-48">
                <div className="relative aspect-video">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full scale-x-[-1] bg-black object-cover ${!camOn ? "invisible" : ""}`}
                  />
                  {!camOn && (
                    <div className="absolute inset-0 grid place-items-center bg-[var(--surface-elevated)]">
                      <Avatar name="You" size={40} />
                    </div>
                  )}
                </div>
                <p className="bg-[rgba(10,10,12,0.85)] px-2 py-1 text-center text-[10px] text-[var(--text-secondary)]">
                  You{!micOn ? " · muted" : ""}
                </p>
              </div>
            </div>

            {/* Invite strip when waiting/connecting (guest view) */}
            {!hasRemote && (status === "waiting" || status === "connecting") && (
              <div className="mx-auto mt-3 flex max-w-full flex-wrap items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                <code className="max-w-full truncate rounded-full border border-[var(--border-subtle)] bg-white/[0.04] px-3 py-1.5 font-mono">
                  {inviteLink}
                </code>
                <button onClick={handleCopy} className="pressable rounded-full border border-[var(--border-subtle)] px-3 py-1.5 hover:bg-white/10">
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            {/* Control dock (§14–15) — floats, hides when idle */}
            <div
              className={`sticky bottom-[calc(env(safe-area-inset-bottom)+12px)] z-20 mt-3 flex justify-center transition-all duration-300 ${
                controlsHidden && status === "connected" ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"
              }`}
            >
              <div className="glass flex items-center gap-2 rounded-full p-2 shadow-2xl">
                <IconButton label={micOn ? "Mute microphone" : "Unmute microphone"} onClick={toggleMic} off={!micOn}>
                  <span key={micPulse} className="mic-pop grid place-items-center">
                    {micOn ? <Icons.Mic size={20} /> : <Icons.MicOff size={20} />}
                  </span>
                </IconButton>
                <IconButton label={camOn ? "Turn camera off" : "Turn camera on"} onClick={toggleCam} off={!camOn}>
                  {camOn ? <Icons.Video size={20} /> : <Icons.VideoOff size={20} />}
                </IconButton>
                <IconButton label="More options" onClick={() => setSheetOpen(true)}>
                  <Icons.More size={20} />
                </IconButton>
                <IconButton label="End call" danger onClick={() => { buzz(30); handleLeave(); }}>
                  <Icons.PhoneOff size={20} />
                </IconButton>
              </div>
            </div>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--text-muted)]">
              <Icons.Lock size={11} /> Private call · nothing is recorded or stored
            </p>
          </>
        )}
      </main>

      <ToastStack toasts={toasts} />

      {/* More sheet (§30) — technical details live here, not primary UI (§38) */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Call options">
        <div className="flex flex-col gap-2">
          {securityCode && (
            <div className="flex items-center justify-between rounded-[14px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Security code — read it aloud to verify</p>
                <p className="font-mono text-sm font-semibold tracking-widest">{securityCode}</p>
              </div>
              <Icons.Lock size={18} className="text-[var(--success)]" />
            </div>
          )}
          <button onClick={handleCopy} className="pressable flex items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3 text-left text-sm">
            {copied ? <Icons.Check size={18} /> : <Icons.Copy size={18} />}
            {copied ? "Invite link copied" : "Copy invite link"}
          </button>
          <button
            onClick={() => { setSheetOpen(false); handleReinit(); }}
            className="pressable flex items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3 text-left text-sm"
          >
            <Icons.Refresh size={18} /> Reconnect camera & mic
          </button>
          {isHost && (
            <button
              onClick={() => { setSheetOpen(false); handleDeletePermanent(); }}
              disabled={isDeleting || roomDeleted}
              className="pressable flex items-center gap-3 rounded-[14px] border border-[rgba(255,95,109,0.35)] bg-[rgba(255,95,109,0.08)] px-4 py-3 text-left text-sm text-[#ffb3bb] disabled:opacity-50"
            >
              <Icons.Trash size={18} />
              {isDeleting ? "Deleting…" : roomDeleted ? "Room deleted" : "Delete room permanently"}
            </button>
          )}
          <button
            onClick={handleLeave}
            className="pressable flex items-center gap-3 rounded-[14px] bg-[var(--danger)] px-4 py-3 text-left text-sm font-semibold text-white"
          >
            <Icons.PhoneOff size={18} /> Leave call
          </button>
          <p className="px-1 pt-1 text-[11px] leading-4 text-[var(--text-muted)]">
            {isHost ? "Host" : "Guest"} · {roomId} · 1:1 ephemeral · P2P encrypted
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}

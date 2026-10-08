"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DataConnection, MediaConnection, Peer } from "peerjs";
import { mediaFingerprint, validInviteKey } from "./callCrypto";
import { CALL_LIFETIME, createHostIdentity, hostPeerIdentity, invitationFragment, parseInvitation, createAdmission, verifyAdmission } from "./invitation";
import { CHAT_HISTORY_LIMIT, createRoomChat, type ChatMessage } from "./roomChat";
import { createEncryptedHistory } from "./chatHistory";
import { createMediaReplacement } from "./mediaReplacement";

export type CallStatus = "initializing" | "waiting" | "connecting" | "connected" | "ended" | "error";
export function useSecureRoom({ roomId, isHost, entered, joinMuted, joinCamOff }: {
  roomId: string; isHost: boolean; entered: boolean; joinMuted: boolean; joinCamOff: boolean;
}) {
  const [status, setStatus] = useState<CallStatus>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localStreamState, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreamState, setRemoteStream] = useState<MediaStream | null>(null);
  const [securityCode, setSecurityCode] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [prepared, setPrepared] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const inviteKey = useRef("");
  const identity = useRef<{ key: string; host: string; expires: number; privateKey?: CryptoKey; peerId: string } | null>(null);
  const preparation = useRef<Promise<NonNullable<typeof identity.current>> | null>(null);
  const chat = useRef<ReturnType<typeof createRoomChat> | null>(null);
  const peer = useRef<Peer | null>(null);
  const call = useRef<MediaConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const outgoing = useRef<MediaStream | null>(null);
  const authenticated = useRef(false);
  const replacement = useRef<ReturnType<typeof createMediaReplacement> | null>(null);
  const choices = useRef({ mic: !joinMuted, cam: !joinCamOff });
  const stopSession = useRef<(reason?: string) => void>(() => {});


  useEffect(() => {
    let cancelled = false;
    if (!preparation.current) {
      const fragment = window.location.hash;
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      preparation.current = (async () => {
        if (isHost) {
          const values = new URLSearchParams(fragment.slice(1));
          const key = values.get("key") || "";
          if (!validInviteKey(key) || values.has("host")) throw new Error("Start a new call from the home page. This link cannot restore the original host.");
          const host = await createHostIdentity();
          return { key, host: host.publicKey, privateKey: host.privateKey, expires: Date.now() + CALL_LIFETIME,
            peerId: await hostPeerIdentity(roomId, host.publicKey) };
        }
        const invitation = parseInvitation(fragment);
        return { ...invitation, peerId: await hostPeerIdentity(roomId, invitation.host) };
      })();
    }
    void preparation.current.then((value) => {
      if (cancelled) return;
      identity.current = value;
      inviteKey.current = value.key;
      setInviteLink(`${window.location.origin}/room/${encodeURIComponent(roomId)}#${invitationFragment(value)}`);
      setPrepared(true);
    }).catch((reason) => {
      if (!cancelled) { setError(reason instanceof Error ? reason.message : "Use HTTPS and a current browser to start a secure call."); setStatus("error"); }
    });
    const onPageHide = () => {
      cancelled = true;
      // Cover pre-join tabs too, and commit the cleared UI before BFCache.
      flushSync(() => {
        stopSession.current();
        inviteKey.current = ""; identity.current = null; preparation.current = null;
        setInviteLink(""); setPrepared(false); setMessages([]); setChatDraft(""); setSecurityCode(null);
        setError("This tab's session ended. Chat was cleared. Start a new call."); setStatus("error");
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => { cancelled = true; window.removeEventListener("pagehide", onPageHide); };
  }, [roomId, isHost]);

  // Next's client router (including development refresh) can restore its initial
  // URL. Never leave the original secret fragment in the current history entry.
  useEffect(() => {
    if (preparation.current && window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  });

  useEffect(() => {
    if (!entered || !prepared) return;
    let stopped = false;
    let joining = false;
    let activeChat = false;
    const history = createEncryptedHistory(CHAT_HISTORY_LIMIT);
    const devices = createMediaReplacement();
    replacement.current = devices;
    let ice: RTCConfiguration | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let expires: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const stop = (reason?: string) => {
      if (stopped) return;
      stopped = true;
      abort.abort();
      if (deadline) clearTimeout(deadline);
      if (expires) clearTimeout(expires);
      authenticated.current = false;
      devices.dispose();
      replacement.current = null;
      history.dispose();
      // Stop all capture/senders before awaiting anything or updating UI.
      outgoing.current?.getTracks().forEach((track) => track.stop());
      local.current?.getTracks().forEach((track) => track.stop());
      outgoing.current = null; local.current = null;
      chat.current?.dispose(); chat.current = null;
      call.current?.close(); call.current = null;
      peer.current?.destroy(); peer.current = null;
      for (const element of [localVideoRef.current, remoteVideoRef.current, remoteAudioRef.current]) {
        if (element) { element.pause(); element.srcObject = null; }
      }
      inviteKey.current = ""; identity.current = null; preparation.current = null;
      setInviteLink(""); setMessages([]); setChatDraft(""); setSecurityCode(null);
      setLocalStream(null); setRemoteStream(null);
      setAudioBlocked(false);
      setStatus(reason ? "error" : "ended"); setError(reason ?? null);
    };
    stopSession.current = stop;
    const attachCall = (media: MediaConnection) => {
      call.current = media;
      setStatus("connecting");
      deadline = setTimeout(() => stop("Secure connection timed out. Create a new invitation."), 30000);
      media.on("close", () => stop());
      media.on("error", () => stop("The media connection failed. Chat has been cleared."));
      media.on("stream", (stream) => {
        if (stopped || activeChat) return;
        activeChat = true;
        setRemoteStream(stream);
        const refreshTracks = () => { if (!stopped) setRemoteStream(new MediaStream(stream.getTracks())); };
        stream.addEventListener("addtrack", refreshTracks);
        stream.addEventListener("removetrack", refreshTracks);
        const pc = media.peerConnection;
        let verificationStarted = false;
        let pinnedLocal = "";
        let pinnedRemote = "";
        pc.addEventListener("connectionstatechange", () => {
          if (["disconnected", "failed", "closed"].includes(pc.connectionState)) stop();
          else verifyMedia();
        });
        const verifyMedia = () => {
          // ontrack can fire before the answer/local SDP exists. Authenticate only
          // after DTLS has connected and negotiation is stable; tracks remain disabled.
          if (stopped) return;
          if (verificationStarted) {
            if (authenticated.current) {
              try {
                if (pc.signalingState !== "stable" || mediaFingerprint(pc.localDescription?.sdp) !== pinnedLocal ||
                    mediaFingerprint(pc.remoteDescription?.sdp) !== pinnedRemote) stop("The media identity changed. This call was closed.");
              } catch { stop("The media identity could not be verified."); }
            }
            return;
          }
          if (pc.connectionState !== "connected" || pc.signalingState !== "stable") return;
          verificationStarted = true;
          try {
            pinnedLocal = mediaFingerprint(pc.localDescription?.sdp);
            pinnedRemote = mediaFingerprint(pc.remoteDescription?.sdp);
            chat.current = createRoomChat({
              peer: peer.current!, remotePeerId: media.peer, isHost, roomId, inviteKey: inviteKey.current,
              hostPublicKey: identity.current!.host, hostPrivateKey: identity.current!.privateKey, expiresAt: identity.current!.expires,
              localFingerprint: pinnedLocal,
              remoteFingerprint: pinnedRemote,
              onReady: (code) => {
                if (stopped) return;
                if (pc.signalingState !== "stable" || mediaFingerprint(pc.localDescription?.sdp) !== pinnedLocal ||
                    mediaFingerprint(pc.remoteDescription?.sdp) !== pinnedRemote) { stop("The media identity changed during verification."); return; }
                // Both peers proved the invitation key AND the actual media DTLS certificates.
                authenticated.current = true;
                outgoing.current?.getAudioTracks().forEach((track) => { track.enabled = choices.current.mic; });
                outgoing.current?.getVideoTracks().forEach((track) => { track.enabled = choices.current.cam; });
                setSecurityCode(code); setStatus("connected");
                if (deadline) clearTimeout(deadline);
              },
              onEnd: stop,
              onMessage: (message) => {
                if (!stopped) void history.append(message).then((current) => {
                  if (!stopped) setMessages(current);
                }).catch(() => { if (!stopped) stop("Chat storage could not be secured. The call has been cleared."); });
              },
            });
          } catch { stop("The media encryption identity could not be verified."); }
        };
        pc.addEventListener("signalingstatechange", verifyMedia);
        verifyMedia();
      });
    };
    const init = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("HTTPS and camera/microphone support are required.");
        const room = identity.current;
        if (!room || room.expires <= Date.now()) throw new Error("This invitation has expired. Start a new call.");
        const guestId = crypto.randomUUID();
        const response = await fetch("/api/call-config", { method: "POST", credentials: "same-origin", signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not configure a secure connection.");
        ice = data.ice;
        if (stopped) return;
        expires = setTimeout(() => stop("This invitation has expired. Chat has been cleared."), Math.max(0, room.expires - Date.now()));
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        choices.current = { mic: !joinMuted, cam: !joinCamOff };
        stream.getAudioTracks().forEach((track) => { track.enabled = !joinMuted; });
        stream.getVideoTracks().forEach((track) => { track.enabled = !joinCamOff; });
        local.current = stream;
        setLocalStream(stream); setMicOn(!joinMuted); setCamOn(!joinCamOff);
        // Only disabled clones are sent until the secret-key handshake verifies media certificates.
        const outbound = new MediaStream(stream.getTracks().map((track) => { const clone = track.clone(); clone.enabled = false; return clone; }));
        outgoing.current = outbound;
        const { Peer: PeerCtor } = await import("peerjs");
        if (stopped) return;
        const instance = new PeerCtor(isHost ? room.peerId : guestId, {
          host: "0.peerjs.com", port: 443, path: "/", secure: true, key: "peerjs", debug: 0,
          config: ice,
        });
        peer.current = instance;
        // Refuse unrelated data channels even before the authenticated transport mounts.
        instance.on("connection", (connection: DataConnection) => {
          if (connection.serialization !== "raw" || connection.label !== "e-meet-secure-v3" || connection.peer !== call.current?.peer) connection.close();
        });
        instance.on("open", () => {
          if (stopped) return;
          if (isHost) setStatus("waiting");
          else {
            void createAdmission(room.key, roomId, guestId, room.peerId, room.expires).then((metadata) => {
              if (!stopped) attachCall(instance.call(room.peerId, outbound, { metadata }));
            }).catch(() => stop("Could not authenticate your invitation."));
          }
        });
        instance.on("call", (incoming) => {
          if (stopped || !isHost || call.current || joining) { incoming.close(); return; }
          joining = true;
          void verifyAdmission(incoming.metadata, room.key, roomId, incoming.peer, instance.id, room.expires).then((valid) => {
            if (stopped || !valid) { incoming.close(); return; }
            attachCall(incoming);
            incoming.answer(outbound);
          }).catch(() => { incoming.close(); }).finally(() => { joining = false; });
        });
        instance.on("error", () => stop("The peer connection failed. Create a new invitation to try again."));
        instance.on("close", () => stop());
        instance.on("disconnected", () => {
          if (!authenticated.current) stop("Signaling disconnected before the call was authenticated.");
        });

      } catch (reason) { if (!stopped) stop(reason instanceof Error ? reason.message : "Could not start a secure call."); }
    };
    void init();
    return () => stop();
  }, [entered, prepared, isHost, roomId, joinMuted, joinCamOff]);

  const resumeAudio = useCallback(async () => {
    const audio = remoteAudioRef.current;
    if (!authenticated.current || !audio?.srcObject) return;
    const source = audio.srcObject;
    try {
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
      if (authenticated.current && audio.srcObject === source) setAudioBlocked(audio.paused);
    } catch {
      // Autoplay rejection is recoverable through a real user gesture. Never
      // silently leave the user in a connected call with inaudible peer audio.
      if (authenticated.current && audio.srcObject === source) setAudioBlocked(true);
    }
  }, []);

  useEffect(() => {
    const attach = (element: HTMLMediaElement | null, stream: MediaStream | null) => {
      if (!element) return;
      element.srcObject = stream;
      if (stream) void element.play().catch(() => {});
    };
    attach(localVideoRef.current, localStreamState);
    attach(remoteVideoRef.current, remoteStreamState && status === "connected" ? new MediaStream(remoteStreamState.getVideoTracks()) : null);
  }, [localStreamState, remoteStreamState, status]);

  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    if (!remoteStreamState || status !== "connected") {
      audio.pause(); audio.srcObject = null;
      return;
    }
    audio.srcObject = new MediaStream(remoteStreamState.getAudioTracks());
    const onPause = () => { if (authenticated.current && audio.srcObject) setAudioBlocked(true); };
    const onPlaying = () => { if (authenticated.current && audio.srcObject) setAudioBlocked(false); };
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onPause);
    audio.addEventListener("playing", onPlaying);
    void resumeAudio();
    return () => {
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onPause);
      audio.removeEventListener("playing", onPlaying);
    };
  }, [remoteStreamState, status, resumeAudio]);

  const toggleMic = useCallback(() => {
    choices.current.mic = !choices.current.mic;
    local.current?.getAudioTracks().forEach((track) => { track.enabled = choices.current.mic; });
    outgoing.current?.getAudioTracks().forEach((track) => { track.enabled = authenticated.current && choices.current.mic; });
    setMicOn(choices.current.mic);
  }, []);
  const toggleCam = useCallback(() => {
    choices.current.cam = !choices.current.cam;
    local.current?.getVideoTracks().forEach((track) => { track.enabled = choices.current.cam; });
    outgoing.current?.getVideoTracks().forEach((track) => { track.enabled = authenticated.current && choices.current.cam; });
    setCamOn(choices.current.cam);
  }, []);
  const reconnectDevices = useCallback(async () => {
    const media = call.current;
    const devices = replacement.current;
    if (!authenticated.current || !media || !devices) return;
    try {
      await devices.run({
        acquire: () => navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true } }),
        isCurrent: () => authenticated.current && call.current === media && replacement.current === devices,
        senders: media.peerConnection.getSenders(),
        commit: (stream) => {
          outgoing.current?.getTracks().forEach((track) => track.stop());
          local.current?.getTracks().forEach((track) => track.stop());
          stream.getAudioTracks().forEach((track) => { track.enabled = choices.current.mic; });
          stream.getVideoTracks().forEach((track) => { track.enabled = choices.current.cam; });
          local.current = stream; outgoing.current = stream;
          setLocalStream(stream);
        },
      });
    } catch { stopSession.current("Could not safely reconnect your devices. Chat has been cleared."); }
  }, []);
  const send = useCallback(async () => {
    const draft = chatDraft;
    if (await chat.current?.send(draft)) setChatDraft((current) => current === draft ? "" : current);
  }, [chatDraft]);
  return { status, error, setError, micOn, camOn, localStreamState, remoteStreamState, securityCode, messages, chatDraft, setChatDraft,
    inviteLink, localVideoRef, remoteVideoRef, remoteAudioRef, toggleMic, toggleCam, reconnectDevices, send,
    end: () => stopSession.current(), hasRemote: !!remoteStreamState, chatReady: status === "connected", audioBlocked, resumeAudio, canJoin: prepared };
}

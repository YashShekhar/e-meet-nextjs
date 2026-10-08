"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { isSoundOn, playSound, setSoundOn } from "@/lib/sounds";
import { FloatingSelfView } from "@/components/FloatingSelfView";
import { RoomChat } from "@/components/RoomChat";
import { useSecureRoom } from "@/lib/useSecureRoom";
import {
  Avatar,
  BottomSheet,
  Button,
  IconButton,
  Icons,
  LevelDots,
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
      body: "This session has ended. Ask for a fresh invite link.",
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

/* Live mic/peer voice level (0..1) via WebAudio analyser.
   Returns 0 when the stream has no audio track or metering fails. */
function useAudioLevel(stream: MediaStream | null, resumeToken: number): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- stream swap is external
      setLevel(0);
      return;
    }
    let cancelled = false;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let src: MediaStreamAudioSourceNode | null = null;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (cancelled) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setLevel(0);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { src?.disconnect(); } catch {}
      try { void ctx?.close().catch(() => {}); } catch {}
    };
    // resumeToken re-creates the context after a user gesture so a context
    // born "suspended" (autoplay policy) starts metering for real.
  }, [stream, resumeToken]);
  return level;
}

type Status =
  | "initializing"
  | "waiting"
  | "connecting"
  | "connected"
  | "ended"
  | "error";

export default function RoomClient({ roomId }: { roomId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isHost = searchParams.get("host") === "true";

  const [entered, setEntered] = useState(false);
  const [joinMuted, setJoinMuted] = useState(false);
  const [joinCamOff, setJoinCamOff] = useState(false);
  const { status, error, setError, micOn, camOn, localStreamState, remoteStreamState, securityCode,
    messages, chatDraft, setChatDraft, inviteLink, localVideoRef, remoteVideoRef, remoteAudioRef,
    toggleMic, toggleCam, reconnectDevices: handleReinit, send, end, hasRemote, chatReady } =
    useSecureRoom({ roomId, isHost, entered, joinMuted, joinCamOff });
  const [copied, setCopied] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [readMessages, setReadMessages] = useState(0);
  const [selfAspectRatio, setSelfAspectRatio] = useState(16 / 9);
  const [soundOn, setSoundOnState] = useState(true);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const receivedMessages = messages.filter((message) => message.author === "peer").length;
  const unreadMessages = chatOpen ? 0 : Math.max(0, receivedMessages - readMessages);
  const toggleChat = () => {
    if (chatOpen) chatButtonRef.current?.focus();
    setReadMessages(receivedMessages);
    setChatOpen((open) => !open);
    setControlsHidden(false);
  };
  const updateSelfAspectRatio = useCallback((video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight) setSelfAspectRatio(video.videoWidth / video.videoHeight);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read persisted sound preference
    setSoundOnState(isSoundOn());
  }, []);
  const localLevel = useAudioLevel(micOn ? localStreamState : null, 0);
  const remoteLevel = useAudioLevel(remoteStreamState, 0);
  const localAudioTracks = localStreamState?.getAudioTracks() ?? [];
  const remoteAudioTracks = remoteStreamState?.getAudioTracks() ?? [];
  const speaking = remoteLevel > 0.08;
  const micPulse = micOn ? 1 : 0;
  const retryCount = 0;
  const connState = securityCode ? "Authenticated DTLS-SRTP + encrypted chat" : "Verifying peer";
  const handleLeave = () => { end(); router.push("/"); };
  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true); playSound("copy"); pushToast(setToasts, "Secret invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch { setError("Copy failed. Copy the complete invitation shown in the room."); }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") setSheetOpen(false);
      else if (event.key.toLowerCase() === "m") toggleMic();
      else if (event.key.toLowerCase() === "c") toggleCam();
      else if (event.key.toLowerCase() === "e") { end(); router.push("/"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [end, router, toggleMic, toggleCam]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external call lifecycle
    setControlsHidden(false);
    if (status === "connected") { playSound("connect"); pushToast(setToasts, "Peer verified. Call is end-to-end encrypted."); }
    if (status === "ended" || status === "error") {
      setChatOpen(false); setReadMessages(0); setSheetOpen(false);
    }
  }, [status]);
  const statusMeta: Record<Status, { label: string; tone: "neutral" | "live" | "warn" | "danger" | "info" }> = {
    initializing: { label: "Preparing?", tone: "neutral" }, waiting: { label: "Waiting for peer", tone: "warn" },
    connecting: { label: "Verifying peer?", tone: "info" }, connected: { label: "Encrypted", tone: "live" },
    ended: { label: "Ended", tone: "neutral" }, error: { label: "Call closed", tone: "danger" },
  };
  const friendly = error ? friendlyError(error) : null;
  const inCall = status === "connected" || (status === "connecting" && hasRemote);
  const chromeHidden = controlsHidden && status === "connected" && !sheetOpen && !chatOpen;

  return (
    <div className={`flex flex-1 flex-col ${inCall ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      {/* Top bar — overlays the stage during a call (§13), hides with chrome (§11) */}
      <header
        inert={chromeHidden}
        aria-hidden={chromeHidden}
        className={`z-20 flex shrink-0 items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+12px)] transition-all duration-300 md:px-6 ${
          inCall
            ? `absolute inset-x-0 top-0 ${chromeHidden ? "pointer-events-none -translate-y-2 opacity-0" : "pointer-events-none"}`
            : ""
        }`}
      >
        <div className={`flex min-w-0 items-center gap-2 ${inCall && !chromeHidden ? "pointer-events-auto" : ""}`}>
          <button
            onClick={handleLeave}
            aria-label="Leave call"
            className="pressable glass grid h-10 w-10 shrink-0 place-items-center rounded-full text-white"
          >
            <Icons.Back size={17} />
          </button>
          <div className="glass flex min-w-0 flex-col items-start gap-1 rounded-[18px] px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:pl-3">
            <span className="max-w-full truncate px-1 font-mono text-[11px] font-semibold tracking-wide sm:text-[13px]" title={roomId}>
              {roomId}
            </span>
            <StatusPill tone={statusMeta[status].tone} pulse={status === "waiting" || status === "connecting"}>
              {statusMeta[status].label}
            </StatusPill>
          </div>
        </div>

        <div className={`flex shrink-0 items-center gap-2 ${inCall && !chromeHidden ? "pointer-events-auto" : ""}`}>
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



      {error && status === "error" && (
        <div className="rise-in z-20 mx-4 mt-3 rounded-[20px] border border-[rgba(255,95,109,0.3)] bg-[rgba(255,95,109,0.08)] p-5 text-center md:mx-6">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(255,95,109,0.15)] text-[var(--danger)]">
            <Icons.VideoOff size={22} />
          </div>
          <p className="mt-3 text-[15px] font-semibold text-white">{friendly?.title}</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-[var(--text-secondary)]">{friendly?.body}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => router.push("/")}>Create a new call</Button>
            <Button variant="secondary" onClick={() => router.push("/")}>Go home</Button>
          </div>
        </div>
      )}

      {/* Stage (§13): fixed-viewport shell in call, calm flow otherwise.
          In-call NEVER scrolls — video fills, chrome floats (§18). */}
      <main
        className={
          inCall
            ? `call-stage relative min-h-0 flex-1 overflow-hidden bg-[var(--surface)] ${chromeHidden ? "" : "md:mx-4 md:mb-3 md:rounded-[24px] md:border md:border-[var(--border-subtle)]"} ${chatOpen ? "chat-open" : ""}`
            : "flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] md:px-6"
        }
      >
        {!entered ? (
          /* Pre-join choice — join tap unlocks remote-audio autoplay, and the
             joiner decides upfront whether to be heard (no mid-call prompts) */
          <div className="rise-in mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 overflow-y-auto py-6">
            <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface)] p-6 text-center md:p-7">
              <Avatar name={roomId} size={64} />
              <h2 className="mt-4 text-xl font-semibold">Join this call?</h2>
              <p className="mt-1 font-mono text-[13px] tracking-widest text-[var(--text-secondary)]">{roomId}</p>
              <p className="mx-auto mt-2 max-w-[34ch] text-[13px] leading-5 text-[var(--text-secondary)]">
                {isHost
                  ? "You'll wait as host until your guest joins."
                  : "You'll join with your camera and mic as chosen below."}
              </p>
              {error && status === "error" ? (
                <div className="mt-4 rounded-[14px] border border-[rgba(255,95,109,0.3)] bg-[rgba(255,95,109,0.08)] px-4 py-3">
                  <p className="text-sm font-semibold text-white">{friendly?.title ?? "Can't join"}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{friendly?.body}</p>
                  <Button variant="secondary" onClick={() => router.push("/")} className="mt-3 w-full">
                    Go home
                  </Button>
                </div>
              ) : (
                <>
                  <p className="mt-5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Microphone
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Join with microphone on or muted">
                    <button
                      onClick={() => setJoinMuted(false)}
                      aria-pressed={!joinMuted}
                      className={`pressable flex flex-col items-center gap-2 rounded-[16px] border px-4 py-4 text-sm font-medium ${
                        !joinMuted
                          ? "border-white bg-white text-black"
                          : "border-[var(--border-subtle)] bg-[var(--background)] text-[var(--text-secondary)]"
                      }`}
                    >
                      <Icons.Mic size={20} /> Mic on
                    </button>
                    <button
                      onClick={() => setJoinMuted(true)}
                      aria-pressed={joinMuted}
                      className={`pressable flex flex-col items-center gap-2 rounded-[16px] border px-4 py-4 text-sm font-medium ${
                        joinMuted
                          ? "border-[var(--danger)] bg-[var(--danger)] text-white"
                          : "border-[var(--border-subtle)] bg-[var(--background)] text-[var(--text-secondary)]"
                      }`}
                    >
                      <Icons.MicOff size={20} /> Muted
                    </button>
                  </div>
                  <button
                    onClick={() => setJoinCamOff((v) => !v)}
                    aria-pressed={joinCamOff}
                    className="pressable mt-2 flex w-full items-center gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3.5 text-left text-sm"
                  >
                    {joinCamOff ? <Icons.VideoOff size={18} /> : <Icons.Video size={18} />}
                    {joinCamOff ? "Camera off — join with avatar" : "Camera on"}
                    <span className="ml-auto text-[11px] text-[var(--text-muted)]">tap to toggle</span>
                  </button>
                  <Button
                    onClick={() => {
                      buzz(12);
                      playSound("join");
                      setEntered(true);
                    }}
                    className="mt-4 w-full"
                  >
                    {isHost ? "Start & wait for guest" : "Join call"}
                  </Button>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <Icons.Lock size={11} /> Private · media and chat are not saved
                  </p>
                </>
              )}
            </div>
          </div>
        ) : status === "ended" ? (
          <div className="rise-in mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <Avatar name={roomId} size={80} />
            <h2 className="mt-2 text-2xl font-semibold">Call ended</h2>
            <p className="max-w-[32ch] text-[13px] leading-5 text-[var(--text-secondary)]">
              This session is closed and chat and session keys were cleared. Start fresh whenever you like.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => router.push("/")}>New call</Button>
              <Button variant="secondary" onClick={() => router.push("/")}>Go home</Button>
            </div>
          </div>
        ) : status === "waiting" && isHost && !hasRemote ? (
          /* Calm waiting room (§12) — scrolls internally on short viewports */
          <div className="rise-in mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 overflow-y-auto py-6">
            <div className="overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface)]">
              <div className="relative aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full scale-x-[-1] bg-black object-contain"
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
        ) : inCall ? (
          /* Active call — every layer floats over video, nothing scrolls (§11, §13) */
          <>
            {hasRemote ? (
              <video
                key="remote"
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                controls={false}
                className={`bg-black object-contain ${chatOpen ? "chat-video" : "join-in absolute inset-0 h-full w-full"}`}
              />
            ) : (
              <div className="absolute inset-0">
                <VideoPlaceholder
                  name={isHost ? "Guest" : "Host"}
                  connecting
                  caption={`Connecting…${retryCount ? ` (retry ${retryCount}/3)` : ""}`}
                />
              </div>
            )}
            {/* Hidden voice channel — the ONLY audible remote path. */}
            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

            <button
              type="button"
              aria-label={chromeHidden ? "Show call controls" : "Hide call controls"}
              aria-controls="call-controls"
              aria-expanded={!chromeHidden}
              onClick={() => setControlsHidden((hidden) => !hidden)}
              className={`${chatOpen ? "hidden" : "absolute inset-0 z-[1] h-full w-full touch-manipulation focus-visible:outline-offset-[-4px]"}`}
            />

            {chatOpen && (
              <RoomChat messages={messages} ready={chatReady} draft={chatDraft} onDraft={setChatDraft}
                onClose={toggleChat}
                onSend={send} />
            )}

            {/* Presence fades independently of the persistent video preview. */}
            <div
              inert={chromeHidden || chatOpen}
              aria-hidden={chromeHidden || chatOpen}
              className={`pointer-events-none absolute inset-0 z-10 transition-all duration-300 ${
                chromeHidden || chatOpen ? "opacity-0" : "opacity-100"
              }`}
            >
              {/* Presence + peer voice meter */}
              <div className="call-presence absolute inset-x-3 flex flex-wrap items-center gap-2">
                <span className="glass rounded-full px-3 py-1.5 text-[11px] font-medium text-white">
                  {hasRemote ? (isHost ? "Guest" : "Host") : "No one here yet"}
                </span>
                {hasRemote && (
                  <span
                    className="glass flex items-center gap-2 rounded-full px-3 py-1.5"
                    title={speaking ? "Peer voice detected" : "No peer voice right now"}
                  >
                    <LevelDots level={remoteLevel} label={speaking ? "Peer speaking" : "Peer silent"} />
                    <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                      {speaking ? "speaking" : "quiet"}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Keep the preview mounted and movable in both control states. */}
            <FloatingSelfView aspectRatio={selfAspectRatio} controlsHidden={chromeHidden} compact={chatOpen}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(event) => updateSelfAspectRatio(event.currentTarget)}
                onResize={(event) => updateSelfAspectRatio(event.currentTarget)}
                className={`absolute inset-0 h-full w-full scale-x-[-1] bg-black object-contain ${!camOn ? "invisible" : ""}`}
              />
              {!camOn && (
                <div className="absolute inset-0 grid place-items-center bg-[var(--surface-elevated)]">
                  <Avatar name="You" size={40} />
                </div>
              )}
              <p aria-hidden={chromeHidden} className={`scrim absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 px-2 py-1 text-center text-[10px] text-[var(--text-secondary)] transition-opacity duration-300 ${chromeHidden ? "opacity-0" : "opacity-100"}`}>
                You{!micOn ? " · muted" : ""}
                {micOn && <LevelDots level={localLevel} label="Your mic level — speak to see it move" />}
              </p>
            </FloatingSelfView>

            <div className="call-bottom pointer-events-none absolute inset-x-3 z-10 flex flex-col gap-3">
              {/* Dock + caption — bottom center, above safe area */}
              <div
                id="call-controls"
                inert={chromeHidden}
                aria-hidden={chromeHidden}
                className={`call-dock flex min-w-0 flex-col items-center gap-2 transition-opacity duration-300 ${chromeHidden ? "opacity-0" : "opacity-100"}`}
              >
                <div className="glass pointer-events-auto flex items-center gap-2 rounded-full p-2 shadow-2xl">
                  <IconButton label={micOn ? "Mute microphone (M)" : "Unmute microphone (M)"} onClick={toggleMic} off={!micOn}>
                    <span key={micPulse} className="mic-pop grid place-items-center">
                      {micOn ? <Icons.Mic size={20} /> : <Icons.MicOff size={20} />}
                    </span>
                  </IconButton>
                  <IconButton label={camOn ? "Turn camera off (C)" : "Turn camera on (C)"} onClick={toggleCam} off={!camOn}>
                    {camOn ? <Icons.Video size={20} /> : <Icons.VideoOff size={20} />}
                  </IconButton>
                  <button ref={chatButtonRef} type="button" onClick={toggleChat} aria-label={chatOpen ? "Close chat" : `Open chat${unreadMessages ? ` (${unreadMessages} unread messages)` : ""}`}
                    aria-expanded={chatOpen} aria-controls="room-chat" data-tip={chatOpen ? "Back to video" : "Chat"}
                    className={`pressable dock-btn relative grid h-[52px] w-[52px] place-items-center rounded-full border border-[var(--border-subtle)] ${chatOpen ? "bg-white text-black" : "glass text-white"}`}>
                    <Icons.Chat size={20} />
                    {unreadMessages > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[var(--live)] px-1.5 text-[10px] font-bold text-black">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
                  </button>
                  <IconButton label="More options (Esc closes)" onClick={() => setSheetOpen(true)}>
                    <Icons.More size={20} />
                  </IconButton>
                  <IconButton label="End call (E)" danger onClick={() => { buzz(30); playSound("end"); handleLeave(); }}>
                    <Icons.PhoneOff size={20} />
                  </IconButton>
                </div>
                <p className="scrim flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-center text-[11px] text-[var(--text-secondary)]">
                  <Icons.Lock size={11} /> Private call<span className="hidden sm:inline"> · media and chat are not saved</span>
                </p>
              </div>
            </div>
          </>
        ) : (
          /* Pre-join connecting state — fixed height, never pushes past viewport */
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 py-6">
            <div className="relative h-[44dvh] max-h-[520px] min-h-[280px] overflow-hidden rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface)]">
              <div className="absolute inset-0">
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
              </div>
              <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
              <div className="absolute bottom-3 right-3 aspect-video w-28 overflow-hidden rounded-[16px] border border-[var(--border-strong)] bg-black shadow-xl sm:w-36">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 h-full w-full scale-x-[-1] bg-black object-contain ${!camOn ? "invisible" : ""}`}
                />
                {!camOn && (
                  <div className="absolute inset-0 grid place-items-center bg-[var(--surface-elevated)]">
                    <Avatar name="You" size={36} />
                  </div>
                )}
              </div>
            </div>
            <div className="mx-auto flex max-w-full flex-wrap items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
              <code className="max-w-full truncate rounded-full border border-[var(--border-subtle)] bg-white/[0.04] px-3 py-1.5 font-mono">
                {inviteLink}
              </code>
              <button onClick={handleCopy} className="pressable rounded-full border border-[var(--border-subtle)] px-3 py-1.5 hover:bg-white/10">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex justify-center">
              <div className="glass flex items-center gap-2 rounded-full p-2">
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
                <IconButton label="End call" danger onClick={() => { buzz(30); playSound("end"); handleLeave(); }}>
                  <Icons.PhoneOff size={20} />
                </IconButton>
              </div>
            </div>
          </div>
        )}
      </main>

      <ToastStack toasts={toasts} position="top" />

      {/* More sheet (§30) — technical details live here, not primary UI (§38) */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Call options">
        <div className="flex flex-col gap-2">
          {securityCode && (
            <div className="flex items-center justify-between rounded-[14px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Security code — compare through another trusted channel</p>
                <p className="break-all font-mono text-sm font-semibold tracking-widest">{securityCode}</p>
              </div>
              <Icons.Lock size={18} className="text-[var(--live)]" />
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
          <button
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              setSoundOnState(next);
              if (next) playSound("unmute");
            }}
            className="pressable flex items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3 text-left text-sm"
            aria-pressed={soundOn}
          >
            {soundOn ? <Icons.Mic size={18} /> : <Icons.MicOff size={18} />}
            {soundOn ? "Sounds on" : "Sounds off"}
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">tap to toggle</span>
          </button>

          <button
            onClick={handleLeave}
            className="pressable flex items-center gap-3 rounded-[14px] bg-[var(--danger)] px-4 py-3 text-left text-sm font-semibold text-white"
          >
            <Icons.PhoneOff size={18} /> Leave call
          </button>
          <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--background)] px-4 py-3">
            <p className="text-xs font-semibold text-white">Audio health</p>
            <dl className="mt-2 space-y-1.5 font-mono text-[11px] leading-4 text-[var(--text-secondary)]">
              <div className="flex items-center justify-between gap-2">
                <dt>Your mic</dt>
                <dd className="flex items-center gap-2">
                  <LevelDots level={micOn ? localLevel : 0} label="Your mic level" />
                  {localAudioTracks.length === 0
                    ? "no track"
                    : `${localAudioTracks.length} track${localAudioTracks.length > 1 ? "s" : ""} · ${localAudioTracks[0].enabled ? "on" : "off"} · ${localAudioTracks[0].readyState}`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>Peer voice</dt>
                <dd className="flex items-center gap-2">
                  <LevelDots level={remoteLevel} label="Peer voice level" />
                  {remoteAudioTracks.length === 0
                    ? "no track received"
                    : `${remoteAudioTracks.length} track${remoteAudioTracks.length > 1 ? "s" : ""} · ${remoteAudioTracks[0].muted ? "muted (no data)" : "flowing"} · ${remoteAudioTracks[0].readyState}`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>Connection</dt>
                <dd>{connState ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">
              Speak and watch the dots: if yours don&apos;t move, your mic is blocked. If yours move but
              the peer&apos;s don&apos;t, their voice isn&apos;t reaching you.
            </p>
          </div>
          <p className="px-1 pt-1 text-[11px] leading-4 text-[var(--text-muted)]">
            {isHost ? "Host" : "Guest"} · {roomId} · 1:1 ephemeral · End-to-end encrypted
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}

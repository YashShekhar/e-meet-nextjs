"use client";

import { useEffect, useRef } from "react";
import { CHAT_LIMIT, CHAT_HISTORY_LIMIT, type ChatMessage } from "@/lib/roomChat";
import { Icons } from "./ui";
import styles from "./RoomChat.module.css";

export function RoomChat({ messages, ready, draft, onDraft, onSend, onClose }: {
  messages: ChatMessage[];
  ready: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (followLatest.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  return (
    <section id="room-chat" className={styles.panel} aria-label="In-call chat">
      <div className={styles.heading}>
        <h2>Chat</h2>
        <p role="status">{ready ? "End-to-end encrypted" : "Verifying secure chat…"}</p>
        <button type="button" onClick={onClose} className={styles.back}>
          <Icons.Back size={16} /> Back to video
        </button>
      </div>
      <div ref={log} className={styles.messages} role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions"
        onScroll={() => {
          const el = log.current;
          if (el) followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
        }}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <Icons.Chat size={28} />
            <p>Say hello</p>
            <span>The latest {CHAT_HISTORY_LIMIT} messages stay in this call and are cleared when it ends.</span>
          </div>
        )}
        {messages.map((message) => (
          <div key={`${message.author}-${message.id}`} className={`${styles.message} ${message.author === "you" ? styles.own : ""}`}>
            <span>{message.author === "you" ? "You" : "Peer"}</span>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      <form className={styles.composer} onSubmit={(event) => {
        event.preventDefault();
        followLatest.current = true;
        onSend();
        input.current?.focus({ preventScroll: true });
      }}>
        <label className="sr-only" htmlFor="chat-message">Message</label>
        <textarea ref={input} id="chat-message" value={draft} onChange={(event) => onDraft(event.target.value)}
          placeholder={ready ? "Write a message…" : "Waiting for chat connection…"}
          maxLength={CHAT_LIMIT} rows={2} aria-describedby="chat-hint"
          autoComplete="off" autoCorrect="off" spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }} />
        <button type="submit" disabled={!ready || !draft.trim()}>Send</button>
        <p id="chat-hint">Enter to send · Shift + Enter for a new line <span>{draft.length}/{CHAT_LIMIT}</span></p>
      </form>
    </section>
  );
}

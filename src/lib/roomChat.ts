import type { DataConnection, Peer } from "peerjs";
import { createSecureSession } from "./callCrypto.ts";

export const CHAT_LIMIT = 2000;
export const CHAT_HISTORY_LIMIT = 500;
const CHAT_LABEL = "e-meet-secure-v3";
export type ChatMessage = { id: string; text: string; author: "you" | "peer" };
export function isChatPacket(value: unknown): value is { type: "chat"; id: string; text: string } {
  if (!value || typeof value !== "object") return false;
  const packet = value as Record<string, unknown>;
  return packet.type === "chat" && typeof packet.id === "string" && /^[a-f0-9-]{36}$/.test(packet.id) &&
    typeof packet.text === "string" && packet.text.trim().length > 0 && packet.text.length <= CHAT_LIMIT;
}

export function createRoomChat(options: {
  peer: Peer; remotePeerId: string; isHost: boolean; roomId: string; inviteKey: string;
  localFingerprint: string; remoteFingerprint: string;
  hostPublicKey: string; hostPrivateKey?: CryptoKey; expiresAt: number;
  onReady: (securityCode: string) => void;
  onEnd: (reason?: string) => void;
  onMessage: (message: ChatMessage) => void;
}) {
  const { peer, remotePeerId, isHost, onReady, onEnd, onMessage } = options;
  let session: Awaited<ReturnType<typeof createSecureSession>> | null = null;
  let connection: DataConnection | null = null;
  let disposed = false;
  let ready = false;
  let lastSeen = Date.now();
  let pending = 0;
  let windowStart = Date.now();
  let windowCount = 0;
  let receiveQueue = Promise.resolve();
  let sendQueue: Promise<unknown> = Promise.resolve();
  let pendingSends = 0;
  const setup = createSecureSession({ ...options, localPeerId: peer.id }).then((value) => {
    if (disposed) { value.dispose(); throw new Error("Call ended."); }
    session = value;
    return value;
  });
  const fail = (message = "The secure connection ended. Messages have been cleared.") => {
    if (disposed) return;
    dispose();
    onEnd(message);
  };
  void setup.catch(() => fail("Could not authenticate this call. No media or messages were shared."));
  const sendWire = (value: unknown) => {
    if (disposed || !connection?.open) throw new Error("Channel closed.");
    if (connection.dataChannel?.bufferedAmount > 65536) throw new Error("Channel overloaded.");
    connection.send(JSON.stringify(value));
    if (!connection?.open) throw new Error("Channel closed.");
  };
  const sendEncrypted = (value: unknown) => {
    if (disposed || pendingSends >= 32) return Promise.reject(new Error("Send queue closed or overloaded."));
    pendingSends++;
    const operation = sendQueue.then(async () => {
      if (disposed || !session) throw new Error("Session closed.");
      sendWire(await session.encrypt(value));
    }).finally(() => { pendingSends--; });
    sendQueue = operation.catch(() => {});
    return operation;
  };
  const announce = async () => {
    const secure = await setup;
    if (!disposed && connection?.open && !ready) sendWire(secure.hello);
  };
  const attach = (next: DataConnection) => {
    if (disposed || next.serialization !== "raw" || next.peer !== remotePeerId || next.label !== CHAT_LABEL || connection) { next.close(); return; }
    connection = next;
    next.on("open", () => { void announce().catch(() => fail()); });
    next.on("close", () => fail());
    next.on("error", () => fail());
    next.on("data", (raw: unknown) => {
      if (disposed) return;
      if (Date.now() - windowStart >= 10000) { windowStart = Date.now(); windowCount = 0; }
      if (typeof raw !== "string" || raw.length > 16000 || ++pending > 32 || ++windowCount > 80) {
        fail("The peer sent invalid or excessive traffic. This call was closed."); return;
      }
      receiveQueue = receiveQueue.then(async () => {
        if (disposed) return;
        // A suspended tab must not revive an expired heartbeat by processing
        // buffered packets before its delayed timer runs on resume.
        if (ready && Date.now() - lastSeen > 20000) throw new Error("Session timed out.");
        const secure = await setup;
        const packet = JSON.parse(raw);
        if (packet?.type === "hello") {
          if (await secure.acceptHello(packet)) await sendEncrypted({ type: "ready" });
          return;
        }
        const decoded = await secure.decrypt(packet);
        if (disposed || !decoded || typeof decoded !== "object" || !("type" in decoded)) throw new Error();
        lastSeen = Date.now();
        if (decoded.type === "ready" && !ready) {
          ready = true;
          onReady(secure.securityCode());
        } else if (ready && isChatPacket(decoded)) {
          onMessage({ id: decoded.id, text: decoded.text, author: "peer" });
        } else if (!(ready && decoded.type === "ping")) throw new Error();
      }).catch(() => fail("Peer authentication or message integrity failed. The call was closed and chat cleared."))
        .finally(() => { pending--; });
    });
    if (next.open) void announce().catch(() => fail());
  };
  const incoming = (next: DataConnection) => { if (isHost) next.close(); else attach(next); };
  peer.on("connection", incoming);
  if (isHost) {
    try { attach(peer.connect(remotePeerId, { label: CHAT_LABEL, serialization: "raw", reliable: true })); }
    catch { queueMicrotask(() => fail()); }
  } else {
    const connections = peer.connections as Record<string, DataConnection[]>;
    for (const existing of connections[remotePeerId] ?? []) {
      if (existing.type === "data" && existing.label === CHAT_LABEL) attach(existing);
    }
  }
  const started = Date.now();
  const timer = setInterval(() => {
    if (disposed) return;
    if (!ready) {
      if (Date.now() - started > 20000) fail("Secure peer verification timed out. Please create a new invitation.");
      else void announce().catch(() => fail());
    } else if (Date.now() - lastSeen > 20000) fail();
  }, 1000);
  const heartbeat = setInterval(() => {
    if (ready && !disposed) void sendEncrypted({ type: "ping" }).catch(() => fail());
  }, 5000);
  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    clearInterval(timer); clearInterval(heartbeat);
    peer.off("connection", incoming);
    session?.dispose(); session = null;
    connection?.close(); connection = null;
  }
  return {
    async send(text: string) {
      const packet = { type: "chat", id: crypto.randomUUID(), text: text.trim() };
      if (disposed || !ready || !isChatPacket(packet)) return false;
      try {
        await sendEncrypted(packet);
        if (disposed) return false;
        onMessage({ id: packet.id, text: packet.text, author: "you" });
        return true;
      } catch { fail(); return false; }
    },
    dispose,
  };
}

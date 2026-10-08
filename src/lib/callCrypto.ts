// Browser WebCrypto only. Invite keys never go to application APIs or signaling.
const encoder = new TextEncoder();
const HEX_KEY = /^[a-f0-9]{64}$/;
export const newInviteKey = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const validInviteKey = (key: string) => HEX_KEY.test(key);
export function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (byte) => parseInt(byte, 16));
export function mediaFingerprint(sdp: string | undefined) {
  const fingerprints = [...new Set((sdp ?? "").split(/\r?\n/)
    .filter((line) => line.startsWith("a=fingerprint:"))
    .map((line) => line.slice(14).toUpperCase()))].sort();
  if (fingerprints.length !== 1 || !/^SHA-256 (?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprints[0])) {
    throw new Error("Cannot authenticate the media encryption certificate.");
  }
  return fingerprints[0];
}
type Hello = { v: 3; type: "hello"; role: "host" | "guest"; room: string; from: string; to: string; nonce: string; publicKey: string; fingerprint: string; host: string; expires: number; proof: string; mac: string };
export type CipherPacket = { v: 3; type: "sealed"; sequence: number; ciphertext: string };
const encode64 = (data: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(data)));
const decode64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
const helloBody = (hello: Omit<Hello, "mac">) => JSON.stringify([hello.v, hello.type, hello.role, hello.room, hello.from, hello.to, hello.nonce, hello.publicKey, hello.fingerprint, hello.host, hello.expires]);

export async function createSecureSession(options: {
  roomId: string; inviteKey: string; localPeerId: string; remotePeerId: string;
  isHost: boolean; localFingerprint: string; remoteFingerprint: string;
  hostPublicKey: string; hostPrivateKey?: CryptoKey; expiresAt: number;
}) {
  if (!/^04[a-f0-9]{128}$/.test(options.hostPublicKey) || !Number.isSafeInteger(options.expiresAt) || options.expiresAt <= Date.now()) throw new Error("Invalid host identity or expired invitation.");
  if (!validInviteKey(options.inviteKey)) throw new Error("Invalid invitation key.");
  const rawSecret = unhex(options.inviteKey);
  let authKey: CryptoKey | null;
  try { authKey = await crypto.subtle.importKey("raw", rawSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
  finally { rawSecret.fill(0); }
  let ephemeral: CryptoKeyPair | null = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const role = options.isHost ? "host" : "guest";
  const hello: Hello = { v: 3, type: "hello", role, room: options.roomId, from: options.localPeerId, to: options.remotePeerId,
    nonce: newInviteKey(), publicKey: encode64(await crypto.subtle.exportKey("raw", ephemeral.publicKey)), fingerprint: options.localFingerprint,
    host: options.hostPublicKey, expires: options.expiresAt, proof: "", mac: "" };
  if (options.isHost) {
    if (!options.hostPrivateKey) throw new Error("The original host tab is required.");
    hello.proof = encode64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, options.hostPrivateKey, encoder.encode(helloBody(hello))));
  }
  const hostVerifier = await crypto.subtle.importKey("raw", unhex(options.hostPublicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  hello.mac = hex(await crypto.subtle.sign("HMAC", authKey, encoder.encode(helloBody(hello))));
  let tx: CryptoKey | null = null;
  let rx: CryptoKey | null = null;
  let sendSequence = 0;
  let receiveSequence = 0;
  let decrypting = false;
  let transcript = "";
  let acceptedHello = "";
  let disposed = false;
  // Do not retain the invitation string inside this session's closures.
  const { roomId, localPeerId, remotePeerId, remoteFingerprint, hostPublicKey, expiresAt } = options;
  const nonce = (sequence: number) => { const bytes = new Uint8Array(12); new DataView(bytes.buffer).setBigUint64(4, BigInt(sequence)); return bytes; };
  const aad = (from: string, to: string, sequence: number) => encoder.encode(JSON.stringify(["e-meet-v3", roomId, from, to, transcript, sequence]));
  return {
    hello,
    async acceptHello(value: unknown) {
      if (disposed || !value || typeof value !== "object") throw new Error("Invalid handshake.");
      const other = value as Hello;
      if (other.v !== 3 || other.type !== "hello" || other.role !== (role === "host" ? "guest" : "host") ||
          other.host !== hostPublicKey || other.expires !== expiresAt || Date.now() >= expiresAt ||
          other.room !== roomId || other.from !== remotePeerId || other.to !== localPeerId ||
          typeof other.nonce !== "string" || !HEX_KEY.test(other.nonce) || typeof other.mac !== "string" || !HEX_KEY.test(other.mac) ||
          typeof other.publicKey !== "string" || other.publicKey.length !== 88 || other.fingerprint !== remoteFingerprint) throw new Error("Peer authentication failed.");
      const body = helloBody(other);
      if (acceptedHello) {
        if (acceptedHello !== body) throw new Error("Handshake changed during this call.");
        return false;
      }
      if (!authKey || !ephemeral || !await crypto.subtle.verify("HMAC", authKey, unhex(other.mac), encoder.encode(body))) throw new Error("Invitation authentication failed.");
      if (role === "guest" && (typeof other.proof !== "string" || other.proof.length !== 88 ||
          !await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, hostVerifier, decode64(other.proof), encoder.encode(body)))) throw new Error("Original host authentication failed.");
      const publicKey = await crypto.subtle.importKey("raw", decode64(other.publicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
      const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, ephemeral.privateKey, 256));
      let material: CryptoKey;
      try { material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]); }
      finally { shared.fill(0); }
      const transcriptBytes = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(role === "host" ? [helloBody(hello), body] : [body, helloBody(hello)])));
      const derive = (direction: string) => crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: transcriptBytes,
        info: encoder.encode(`e-meet-v3:${direction}`) }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const [outgoing, incoming] = await Promise.all([derive(role), derive(role === "host" ? "guest" : "host")]);
      if (disposed) throw new Error("Call ended.");
      transcript = hex(transcriptBytes);
      tx = outgoing; rx = incoming; ephemeral = null; authKey = null; acceptedHello = body;
      return true;
    },
    securityCode() { return transcript.slice(0, 32).toUpperCase().match(/.{1,4}/g)?.join("-") ?? ""; },
    async encrypt(value: unknown): Promise<CipherPacket> {
      if (disposed || !tx || Date.now() >= expiresAt || sendSequence >= 1000000) throw new Error("Secure session is unavailable.");
      const plaintext = encoder.encode(JSON.stringify(value));
      if (plaintext.length > 10000) { plaintext.fill(0); throw new Error("Message too large."); }
      const sequence = ++sendSequence;
      try {
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce(sequence), additionalData: aad(localPeerId, remotePeerId, sequence), tagLength: 128 }, tx, plaintext);
        if (disposed || Date.now() >= expiresAt) throw new Error("Call ended.");
        return { v: 3, type: "sealed", sequence, ciphertext: encode64(ciphertext) };
      } finally { plaintext.fill(0); }
    },
    async decrypt(value: unknown): Promise<unknown> {
      if (disposed || decrypting || !rx || Date.now() >= expiresAt || !value || typeof value !== "object") throw new Error("Secure session is unavailable.");
      const packet = value as CipherPacket;
      if (packet.v !== 3 || packet.type !== "sealed" || !Number.isSafeInteger(packet.sequence) || packet.sequence !== receiveSequence + 1 ||
          typeof packet.ciphertext !== "string" || packet.ciphertext.length > 14000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(packet.ciphertext)) throw new Error("Invalid or replayed message.");
      decrypting = true;
      let plaintext: Uint8Array | undefined;
      try {
        plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce(packet.sequence),
          additionalData: aad(remotePeerId, localPeerId, packet.sequence), tagLength: 128 }, rx, decode64(packet.ciphertext)));
        if (disposed || Date.now() >= expiresAt) throw new Error("Call ended.");
        const decoded: unknown = JSON.parse(new TextDecoder().decode(plaintext));
        receiveSequence = packet.sequence;
        return decoded;
      } finally { plaintext?.fill(0); decrypting = false; }
    },
    dispose() { disposed = true; tx = null; rx = null; authKey = null; ephemeral = null; transcript = ""; acceptedHello = ""; },
  };
}

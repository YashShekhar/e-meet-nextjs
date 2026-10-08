import { hex, validInviteKey } from "./callCrypto.ts";

export const ROOM_ID_REGEX = /^[A-Z0-9]{6}-[A-Z0-9]{4}$/;
export const CALL_LIFETIME = 2 * 60 * 60 * 1000;
export const validHostIdentity = (value: string) => /^04[a-f0-9]{128}$/.test(value);
export type Invitation = { key: string; host: string; expires: number };

export function parseInvitation(fragment: string): Invitation {
  if (fragment.length > 512) throw new Error("Invalid invitation.");
  const values = new URLSearchParams(fragment.replace(/^#/, ""));
  const key = values.get("key") || "";
  const host = values.get("host") || "";
  const expires = Number(values.get("expires"));
  if (!validInviteKey(key) || !validHostIdentity(host) || !Number.isSafeInteger(expires) ||
      expires <= Date.now() || expires > Date.now() + CALL_LIFETIME + 60000) {
    throw new Error("Open a complete, unexpired secret invitation from your host.");
  }
  return { key, host, expires };
}
export function invitationFragment(invitation: Invitation) {
  return new URLSearchParams({ key: invitation.key, host: invitation.host, expires: String(invitation.expires) }).toString();
}
export async function createHostIdentity() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  return { privateKey: pair.privateKey, publicKey: hex(await crypto.subtle.exportKey("raw", pair.publicKey)) };
}
export async function hostPeerIdentity(roomId: string, publicKey: string) {
  if (!ROOM_ID_REGEX.test(roomId) || !validHostIdentity(publicKey)) throw new Error("Invalid host identity.");
  return "emeet-" + hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`e-meet-host-v3:${roomId}:${publicKey}`)));
}

const encoder = new TextEncoder();
const admissionBody = (room: string, from: string, to: string, expires: number, nonce: string) =>
  encoder.encode(JSON.stringify(["e-meet-admission-v3", room, from, to, expires, nonce]));
async function admissionKey(key: string) {
  if (!validInviteKey(key)) throw new Error("Invalid invitation.");
  const bytes = Uint8Array.from(key.match(/../g)!, (byte) => parseInt(byte, 16));
  try { return await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
  finally { bytes.fill(0); }
}
export async function createAdmission(key: string, room: string, from: string, to: string, expires: number) {
  const nonce = crypto.randomUUID();
  return { nonce, mac: hex(await crypto.subtle.sign("HMAC", await admissionKey(key), admissionBody(room, from, to, expires, nonce))) };
}
export async function verifyAdmission(value: unknown, key: string, room: string, from: string, to: string, expires: number) {
  if (!value || typeof value !== "object" || from.length > 100 || to.length > 100 || Date.now() >= expires) return false;
  const { nonce, mac } = value as Record<string, unknown>;
  if (typeof nonce !== "string" || !/^[a-f0-9-]{36}$/.test(nonce) || typeof mac !== "string" || !/^[a-f0-9]{64}$/.test(mac)) return false;
  return crypto.subtle.verify("HMAC", await admissionKey(key), Uint8Array.from(mac.match(/../g)!, (byte) => parseInt(byte, 16)),
    admissionBody(room, from, to, expires, nonce));
}

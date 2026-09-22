// In-memory + file-backed store for room lifecycle
// Guarantees: once deleted → never reusable, once full (2 participants) → 3rd join blocked
// Launch-ready: per-room mutex, HMAC host token, bounded inputs, no-store leaks minimized

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export type RoomStatus = "waiting" | "full" | "deleted";

export interface Room {
  id: string; // normalized A-Z0-9-XXXXXX-XXXX
  status: RoomStatus;
  participants: number; // ever joined count (0-2)
  hostPeerId: string | null; // capped 64, for audit only
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export const ROOM_ID_REGEX = /^[A-Z0-9]{6}-[A-Z0-9]{4}$/;
const HOST_PEER_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_HOST_PEER_ID_LEN = 64;
const DATA_FILE = path.join(process.cwd(), "data", "room-store.json");

// HMAC secret — MUST be set via env in production for cross-instance verification
// Fallback is deterministic for dev/demo but warn in logs
const HMAC_SECRET = process.env.ROOM_HMAC_SECRET || "e-meet-dev-secret-please-set-ROOM_HMAC_SECRET-in-prod";
if (!process.env.ROOM_HMAC_SECRET) {
  console.warn("[roomStore] ROOM_HMAC_SECRET not set — using dev fallback (do not use in production)");
}

export function generateHostToken(roomId: string): string {
  return crypto.createHmac("sha256", HMAC_SECRET).update(roomId).digest("hex");
}

export function verifyHostToken(roomId: string, token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  if (token.length !== 64) return false; // hex sha256
  const expected = generateHostToken(roomId);
  try {
    // constant-time compare
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
  } catch {
    return false;
  }
}

// global singleton survives hot reload
declare global {
  var __ROOM_STORE__: Map<string, Room> | undefined;
  var __ROOM_STORE_INIT__: boolean | undefined;
  var __ROOM_LOCKS__: Map<string, Promise<void>> | undefined;
}

function getStore(): Map<string, Room> {
  if (!globalThis.__ROOM_STORE__) {
    globalThis.__ROOM_STORE__ = new Map<string, Room>();
  }
  return globalThis.__ROOM_STORE__!;
}

function getLocks(): Map<string, Promise<void>> {
  if (!globalThis.__ROOM_LOCKS__) globalThis.__ROOM_LOCKS__ = new Map();
  return globalThis.__ROOM_LOCKS__!;
}

// Per-room mutex: chains promises per id so read-modify-write is atomic per room
async function withRoomLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const locks = getLocks();
  const prev = locks.get(id) || Promise.resolve();
  let release: () => void;
  const cur = new Promise<void>((res) => (release = res));
  // chain: prev -> cur
  locks.set(id, prev.then(() => cur));
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    // cleanup if no queued waiter beyond cur
    // Do not delete blindly; if next waiter already set to cur's successor, keep it
    // Simplify: if current lock still maps to cur, delete
    if (locks.get(id) === cur) locks.delete(id);
    else {
      // there is a successor waiting on cur, let it proceed
    }
  }
}

let writeChain: Promise<void> = Promise.resolve();

async function persist() {
  const store = getStore();
  const data = JSON.stringify(Object.fromEntries(store.entries()), null, 2);
  writeChain = writeChain
    .then(async () => {
      try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        // File lock best-effort: write atomically via tmp+rename
        const tmp = DATA_FILE + ".tmp";
        await fs.writeFile(tmp, data, "utf-8");
        await fs.rename(tmp, DATA_FILE);
      } catch {
        // file persistence is best-effort (Vercel read-only) — memory still authoritative
      }
    })
    .catch(() => {});
  return writeChain;
}

async function loadFromDisk() {
  if (globalThis.__ROOM_STORE_INIT__) return;
  globalThis.__ROOM_STORE_INIT__ = true;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const obj = JSON.parse(raw) as Record<string, Room>;
    const store = getStore();
    for (const [k, v] of Object.entries(obj)) {
      if (typeof k === "string" && ROOM_ID_REGEX.test(k) && v && typeof v.status === "string") {
        // sanitize bounds
        if (v.hostPeerId && (typeof v.hostPeerId !== "string" || v.hostPeerId.length > MAX_HOST_PEER_ID_LEN || !HOST_PEER_ID_REGEX.test(v.hostPeerId))) {
          v.hostPeerId = null;
        }
        if (typeof v.participants !== "number" || v.participants < 0 || v.participants > 2) v.participants = Math.min(2, Math.max(0, v.participants || 0));
        store.set(k, v);
      }
    }
  } catch {
    // no file yet
  }
}

loadFromDisk().catch(() => {});

export function validateRoomId(id: string): boolean {
  return ROOM_ID_REGEX.test(id);
}

export function validateHostPeerId(id: string | null | undefined): boolean {
  if (!id) return true; // optional
  return typeof id === "string" && id.length <= MAX_HOST_PEER_ID_LEN && HOST_PEER_ID_REGEX.test(id);
}

export async function getRoom(id: string): Promise<Room | null> {
  await loadFromDisk();
  const store = getStore();
  return store.get(id) ?? null;
}

export async function createRoom(
  id: string,
  hostPeerId: string | null = null
): Promise<{ ok: boolean; room?: Room; token?: string; error?: string; code?: number }> {
  return withRoomLock(id, async () => {
    await loadFromDisk();
    const store = getStore();
    if (!validateRoomId(id)) return { ok: false, error: "Invalid room ID format", code: 400 };
    if (hostPeerId !== null && !validateHostPeerId(hostPeerId)) {
      return { ok: false, error: "Invalid hostPeerId — must be 1-64 alphanum/_/-", code: 400 };
    }
    const existing = store.get(id);
    if (existing) {
      if (existing.status === "deleted") return { ok: false, error: "Room permanently deleted and cannot be reused", code: 410 };
      return { ok: false, error: "Room already exists", code: 409 };
    }
    const room: Room = {
      id,
      status: "waiting",
      participants: 1,
      hostPeerId: hostPeerId && hostPeerId.length ? hostPeerId.slice(0, MAX_HOST_PEER_ID_LEN) : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    store.set(id, room);
    await persist();
    const token = generateHostToken(id);
    return { ok: true, room, token };
  });
}

export async function joinRoom(id: string): Promise<{ ok: boolean; room?: Room; error?: string; code?: number }> {
  return withRoomLock(id, async () => {
    await loadFromDisk();
    const store = getStore();
    const room = store.get(id);
    if (!room) return { ok: false, error: "Room not found — ask host to create with ?host=true", code: 404 };
    if (room.status === "deleted") return { ok: false, error: "Room permanently deleted", code: 410 };
    if (room.status === "full" || room.participants >= 2) {
      return { ok: false, error: "Room is full — 1:1 limit reached (2 participants). No third join allowed.", code: 403 };
    }
    room.participants += 1;
    if (room.participants >= 2) room.status = "full";
    room.updatedAt = Date.now();
    store.set(id, room);
    await persist();
    return { ok: true, room };
  });
}

export async function deleteRoomPermanent(
  id: string,
  token?: string | null
): Promise<{ ok: boolean; room?: Room; error?: string; code?: number }> {
  return withRoomLock(id, async () => {
    await loadFromDisk();
    // AuthZ: must provide valid host token
    if (!verifyHostToken(id, token)) {
      return { ok: false, error: "Unauthorized — valid host token required to delete", code: 401 };
    }
    const store = getStore();
    const existing = store.get(id);
    if (!existing) {
      const tomb: Room = {
        id,
        status: "deleted",
        participants: 0,
        hostPeerId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: Date.now(),
      };
      store.set(id, tomb);
      await persist();
      return { ok: true, room: tomb };
    }
    if (existing.status === "deleted") return { ok: true, room: existing };
    existing.status = "deleted";
    existing.deletedAt = Date.now();
    existing.updatedAt = Date.now();
    store.set(id, existing);
    await persist();
    return { ok: true, room: existing };
  });
}

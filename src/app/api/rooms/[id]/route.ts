import { NextRequest, NextResponse } from "next/server";
import { getRoom, joinRoom, deleteRoomPermanent, validateRoomId } from "@/lib/roomStore";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

const NO_STORE = "no-store, no-cache, must-revalidate, private, max-age=0";

function normalize(id: string) {
  try {
    return decodeURIComponent(id).toUpperCase().trim();
  } catch {
    return id.toUpperCase().trim();
  }
}

function getHostToken(req: NextRequest, id: string): string | null {
  // Try cookie first
  const cookie = req.cookies.get(`host_token_${id}`)?.value;
  if (cookie) return cookie;
  // Fallback Authorization: Bearer <token>
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  // Also allow X-Host-Token header
  const x = req.headers.get("x-host-token");
  if (x) return x.trim();
  return null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  const rl = rateLimit(`get:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString(), "Cache-Control": NO_STORE } });

  const { id: raw } = await params;
  const id = normalize(raw);
  if (!validateRoomId(id)) {
    return NextResponse.json({ error: "Invalid room ID format", id }, { status: 400, headers: { "Cache-Control": NO_STORE } });
  }
  const room = await getRoom(id);
  if (!room) return NextResponse.json({ error: "Room not found", id, status: "not_found" }, { status: 404, headers: { "Cache-Control": NO_STORE } });
  if (room.status === "deleted") {
    return NextResponse.json({ error: "Room permanently deleted — code will never be reused", id, status: "deleted", deletedAt: room.deletedAt }, { status: 410, headers: { "Cache-Control": NO_STORE } });
  }
  // Minimal leakage: only id + status (no participants/timestamps)
  return NextResponse.json({ room: { id: room.id, status: room.status } }, { headers: { "Cache-Control": NO_STORE } });
}

// Guest joins — enforces 1:1 (max 2, never decrement)
export async function POST(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  const rl = rateLimit(`join:${ip}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited — try again later" }, { status: 429, headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString(), "Cache-Control": NO_STORE } });

  const { id: raw } = await params;
  const id = normalize(raw);
  if (!validateRoomId(id)) {
    return NextResponse.json({ error: "Invalid room ID" }, { status: 400, headers: { "Cache-Control": NO_STORE } });
  }
  const result = await joinRoom(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, status: result.room?.status }, { status: result.code || 400, headers: { "Cache-Control": NO_STORE } });
  }
  const r = result.room!;
  return NextResponse.json({ ok: true, room: { id: r.id, status: r.status } }, { headers: { "Cache-Control": NO_STORE } });
}

// Host permanently deletes — never reusable (410 tombstone) — requires valid HMAC token
export async function DELETE(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  const rl = rateLimit(`delete:${ip}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString(), "Cache-Control": NO_STORE } });

  const { id: raw } = await params;
  const id = normalize(raw);
  if (!validateRoomId(id)) {
    return NextResponse.json({ error: "Invalid room ID" }, { status: 400, headers: { "Cache-Control": NO_STORE } });
  }
  const token = getHostToken(req, id);
  const result = await deleteRoomPermanent(id, token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code || 500, headers: { "Cache-Control": NO_STORE } });
  const res = NextResponse.json({ ok: true, room: { id: result.room!.id, status: "deleted", deletedAt: result.room!.deletedAt } }, { headers: { "Cache-Control": NO_STORE } });
  // Clear cookie on delete
  res.cookies.set(`host_token_${id}`, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return res;
}

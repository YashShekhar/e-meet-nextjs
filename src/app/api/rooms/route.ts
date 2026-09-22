import { NextRequest, NextResponse } from "next/server";
import { createRoom, validateRoomId, validateHostPeerId } from "@/lib/roomStore";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

const NO_STORE = "no-store, no-cache, must-revalidate, private, max-age=0";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`create:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limited — try again later" }, { status: 429, headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString(), "Cache-Control": NO_STORE } });
  }

  // Enforce body size limit (~1kb) via manual check
  const rawBody = await req.text();
  if (rawBody.length > 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: { "Cache-Control": NO_STORE } });
  }
  let body: { id?: string; hostPeerId?: string } = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: { "Cache-Control": NO_STORE } }); }

  const rawId = body?.id?.toUpperCase().trim();
  if (!rawId || !validateRoomId(rawId)) {
    return NextResponse.json({ error: "Invalid room ID — expected A1B2CD-X9Y2" }, { status: 400, headers: { "Cache-Control": NO_STORE } });
  }
  const hostPeerId = body?.hostPeerId || null;
  if (hostPeerId !== null && !validateHostPeerId(hostPeerId)) {
    return NextResponse.json({ error: "Invalid hostPeerId" }, { status: 400, headers: { "Cache-Control": NO_STORE } });
  }

  const result = await createRoom(rawId, hostPeerId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code || 400, headers: { "Cache-Control": NO_STORE } });
  }

  const res = NextResponse.json({ ok: true, room: { id: result.room!.id, status: result.room!.status } }, { status: 201, headers: { "Cache-Control": NO_STORE } });
  // Set httpOnly host token cookie (SameSite Strict, Secure in prod, Path scoped)
  if (result.token) {
    res.cookies.set(`host_token_${rawId}`, result.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 24h
    });
    // Also return token in body for client to store as fallback (e.g., localStorage) if cookie not sent due to fetch credentials
    // But prefer cookie; body token is for non-cookie clients
    const bodyWithToken = { ok: true, room: { id: result.room!.id, status: result.room!.status }, hostToken: result.token };
    return NextResponse.json(bodyWithToken, { status: 201, headers: { "Cache-Control": NO_STORE, "Set-Cookie": res.headers.get("Set-Cookie") || "" } });
  }
  return res;
}

export async function GET() {
  return NextResponse.json({ error: "Use /api/rooms/[id]" }, { status: 405, headers: { "Cache-Control": NO_STORE } });
}

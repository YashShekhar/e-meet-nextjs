import { NextRequest, NextResponse } from "next/server";
import { iceConfiguration } from "@/lib/iceConfig";
import { RequestError } from "@/lib/requestError";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

// Stateless configuration only. Invitations, room state, media and chat never
// reach this endpoint. No disk/database access or long-running server connection.
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store, private", "Pragma": "no-cache" };
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin || req.headers.get("sec-fetch-site") === "cross-site") {
      throw new RequestError(403, "Cross-site request rejected.");
    }
    if (!rateLimit(`config:${getClientIp(req)}`, 20, 60000).ok) throw new RequestError(429, "Too many requests. Try again shortly.");
    return NextResponse.json({ ice: iceConfiguration(Date.now() + 7200000) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestError ? error.message : "Connection configuration is unavailable." },
      { status: error instanceof RequestError ? error.status : 503, headers });
  }
}

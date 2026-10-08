import crypto from "node:crypto";
import { RequestError } from "./requestError.ts";

export function iceConfiguration(expiresAt: number): RTCConfiguration {
  const relayOnly = process.env.WEBRTC_RELAY_ONLY === "true";
  const urls = (process.env.TURN_URLS || "").split(",").map((url) => url.trim()).filter(Boolean);
  const secret = process.env.TURN_SHARED_SECRET;
  const iceServers: RTCIceServer[] = relayOnly ? [] : [{ urls: "stun:stun.l.google.com:19302" }];
  if (urls.length || secret || relayOnly) {
    if (!urls.length || !secret || secret.length < 32 ||
      urls.some((url) => !/^turns:[a-zA-Z0-9.-]+(?::\d{1,5})?(?:\?transport=tcp)?$/.test(url))) {
      throw new RequestError(503, "Secure TURN relay is not configured.");
    }
    // Coturn REST credentials: the shared signing secret stays on the server.
    const expiration = Math.floor(Math.min(expiresAt + 60000, Date.now() + 7260000) / 1000);
    const username = `${expiration}:${crypto.randomUUID()}`;
    iceServers.push({ urls, username, credential: crypto.createHmac("sha1", secret).update(username).digest("base64") });
  }
  return { iceServers, iceTransportPolicy: relayOnly ? "relay" : "all", bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" };
}

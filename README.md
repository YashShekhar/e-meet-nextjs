# E-Meet

Private, two-person video calls and in-call messaging. No accounts or application database.

## Run locally

Use Node.js 22.18+ (`22.x` recommended), then `npm ci` and `npm run dev`. Open localhost in a current browser. Camera/microphone access and WebCrypto require HTTPS outside localhost.

Start a call, choose **Start & wait for guest**, and share the **complete secret invitation** with one person. Keep the original host tab open. Room codes alone cannot authorize calls. Invitations expire after two hours. Reloading, navigating away, closing a tab, or ending the call clears the session; start a fresh call afterward.

The Chat control opens the conversation with video in a small box at the top right. Close chat to restore full video. Your preview can move across the screen when controls are hidden, and stays outside the controls when they are visible.

Controls slide and fade when shown/hidden, with reduced-motion support. If the browser blocks or pauses incoming audio, tap **Enable call audio**. If playback is still silent, check the site's mute setting and the selected speaker/headphone output. Reconnecting camera/microphone preserves your mute choice.

## Deploy on Vercel

1. Import the repository and select the **Next.js** framework preset.
2. Use **Node.js 22.x**, the default `npm run build` command and default output directory.
3. Deploy and use the HTTPS URL. **No Redis, database, storage volume, signing secret or mandatory environment variables are needed.** Custom domains and Vercel preview URLs use the same configuration.
4. Test a call between two browsers/devices on your deployed URL: join, exchange messages, toggle camera/mic and chat, then hang up and confirm the other screen clears.

The runtime is pinned in `package.json` to a [Vercel-supported Node.js version](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Vercel serves the app and a stateless connection-configuration endpoint. The existing public PeerJS service (`0.peerjs.com`) handles signaling; media and encrypted messages use browser-to-browser WebRTC. No WebSocket server or long-lived call process runs inside Vercel Functions. Separate serverless instances do not reset a room or end an established call.

Direct WebRTC works where network traversal permits it. For restrictive networks, configure optional coturn settings in [.env.example](.env.example). `WEBRTC_RELAY_ONLY=true` also hides peers' IPs from each other and refuses direct fallback. No TURN server is bundled; cross-network connectivity cannot be guaranteed with STUN alone. If enabling a relay, use Vercel Firewall limits on `POST /api/call-config` and coturn allocation quotas. Temporary credentials are available to this public, account-free app; the built-in limiter is only per warm server instance. See [Vercel Firewall](https://vercel.com/docs/vercel-firewall).

## Privacy and session lifetime

- Video/audio use WebRTC encryption, bound to an invitation-authenticated handshake. Outgoing media stays disabled until both endpoints verify.
- Messages use AES-256-GCM with fresh ephemeral ECDH keys. Chat never passes through an application API.
- The latest 500 messages are kept in an encrypted, memory-only history with a separate non-exportable key. Displayed text and drafts necessarily exist as plaintext in the UI while in use. Nothing is saved to localStorage, sessionStorage, IndexedDB or disk by the chat feature.
- Hangup, failure, navigation, refresh or tab closure discards history, drafts and keys and stops capture. If a peer disappears without a close event, encrypted heartbeats detect it after about 20 seconds; browser suspension can delay cleanup until resumption.
- The active host tab admits one guest. A fresh host signing identity is pinned in the invitation and destroyed on exit, so a guest cannot impersonate the original host using the old link. There is no central room registry, durable room-code blacklist or transcript recovery. The short display code can theoretically recur; the random invite key and host identity define the actual session.

The invitation is a secret: anyone holding it can compete for the guest slot. Share it through a trusted channel. Compare the security codes in Call options for additional verification.

## Checks

- `npm test`: encryption, authentication, tamper/replay protection, invitation binding, history disposal and TURN configuration.
- `npm run lint`
- `npm run build`
- `npm audit --omit=dev`

See [SECURITY.md](SECURITY.md) for the review and limits. Encryption cannot prevent an invited recipient from recording, a compromised browser from reading content, or a malicious application origin from serving altered JavaScript.

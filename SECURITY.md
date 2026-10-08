# Security review — 8 October 2026

This is a source review and local adversarial testing, not an independent penetration-test certification. The final design uses no application database, Redis, room cookies, filesystem store or server-side call session. It supports Vercel's stateless execution model.

## Findings and changes

| Finding | Change |
| --- | --- |
| Room codes and a host URL flag previously served as authority | A 256-bit random invitation secret authenticates the guest; a fresh host ECDSA identity is pinned in the complete invitation. A URL flag only selects the UI role. |
| A caller could bypass the guest limit via direct signaling | The host verifies an invitation HMAC bound to room, both peer IDs, expiry and nonce before answering. Its in-flight/active-call lock refuses other guests. |
| Server file state and process-local admission were incompatible with Vercel | Removed room CRUD, file persistence, cookies and polling. The live host tab owns the single admission slot. Server restarts cannot erase state needed for an active call. |
| A guest might reclaim a disconnected host's signaling ID | The guest requires an ECDSA signature over the host handshake, using the original public key pinned in the invitation. The non-exportable private key exists only in the original tab. |
| Safety code was derived from public identifiers | It now derives from the authenticated ephemeral exchange and actual media certificate fingerprints. |
| Media could start before authenticating the invited peer | Disabled outbound track clones become enabled only after certificate binding and encrypted key confirmation succeed. |
| Joining could immediately end a call | Verification waits until DTLS is connected and SDP is stable; the data channel uses PeerJS's correct `raw` serializer. |
| Persistent/script-readable room credentials | Removed API-issued room credentials. Old localStorage host tokens/recents are cleared. Invitations remain in fragment/memory and are removed from the current URL after parsing. |
| Chat lacked application-level authenticated encryption | Added ephemeral ECDH/HKDF directional AES-GCM keys, replay/order checks, encrypted heartbeats and key confirmation. No plaintext fallback. |
| Cleanup could retain transcripts/drafts or revive pending work | One teardown clears encrypted history, displayed history, draft, invite and key references; stops tracks; closes channels; and ignores late asynchronous results. |
| Injection exposure | Fresh CSP nonces, strict-dynamic, no production unsafe-inline/unsafe-eval scripts, narrow signaling origins, no-referrer and noncached pages/config responses. |
| Unbounded traffic | Bounded frames, queues, messages/history and rate maps; admission validation; same-origin configuration requests. Global abuse limits remain a platform responsibility. |
| Dependency advisories | Next.js/eslint-config-next upgraded from 16.3.5 to 16.3.8; sharp and source-map-js lockfile dependencies updated. |

## Encryption and authentication

An invitation contains a room display code, browser-generated 256-bit secret, P-256 ECDSA host public key and two-hour expiry. Secret/public key/expiry are carried in the URL fragment, not HTTP requests. The app removes the fragment from the current history entry after parsing. Share it privately. Clipboard contents and links sent through other apps remain under those apps' control.

The host's signaling ID is a domain-separated SHA-256 digest of the room and host public key. A guest authenticates call metadata with HMAC-SHA-256 over room, guest ID, host ID, expiry and random nonce. This rejects callers who only know the signaling ID. Only one authenticated candidate is accepted; someone with the full invite can still consume that slot or deny service.

Each endpoint creates a fresh non-extractable P-256 ECDH private key and random handshake nonce. Protocol-v3 hellos authenticate role, room, both peer IDs, ephemeral public key, nonce, actual SHA-256 media certificate fingerprint, pinned host public key and expiry with invitation-keyed HMAC-SHA-256. The host additionally signs its hello with its tab-only ECDSA private key; the guest requires that signature. Verification starts after media DTLS connects and SDP is stable. Claimed fingerprints must match the actual SDP certificates, and later changes close the call.

HKDF-SHA-256 derives separate directional AES-256-GCM keys from ephemeral ECDH, salted by the canonical host/guest transcript hash. Monotonic sequence numbers make unique GCM nonces; room, sender, recipient, transcript and sequence are authenticated additional data. Replay, reordering, tampering, role/identity substitution and wrong keys fail closed. Encrypted readiness confirms key possession before outgoing audio/video or chat is enabled. The verification code derives from that transcript.

Video/audio use browser WebRTC DTLS-SRTP, with fingerprint authentication binding it to the invitation. Chat adds application encryption inside the encrypted data channel. Neither Vercel nor signaling receives plaintext media/chat. Signaling observes connection metadata and can deny service. This composition uses WebCrypto primitives and still warrants independent cryptographic review for high-risk use.

## Browser storage and deletion

- A separate non-exportable AES-256-GCM key encrypts the latest 500 messages in tab memory, with a fresh random 96-bit IV per record. No chat/key is written to localStorage, sessionStorage, IndexedDB, cookies, server APIs or a file.
- Decrypted text necessarily exists in React/DOM memory while displayed, and drafts remain in memory. Memory encryption cannot protect against an attacker already executing script in the page.
- Hangup, media/data closure, authentication/integrity failure, timeout, expiry, pagehide or unmount clears history/key references, UI/draft and invite. Pagehide synchronously commits a cleared UI before back/forward caching. Reload/back cannot resume an ended session. Pending encryption/decryption cannot repopulate it.
- Remote crashes or lost networks without a close event are detected by encrypted heartbeats after approximately 20 seconds. Browser suspension can delay timers until resumption. No web page can guarantee a cleanup handler runs at OS/process termination; avoiding persistent storage leaves no application transcript to recover after restart.
- The original host private key is never exported. Clearing it prevents another honest client from restoring that original host session with a guest invitation. There is no central revocation database, permanent room-code blacklist or enforcement over modified clients. An invited malicious endpoint can always retain/record what it receives.
- Garbage collection, swap and crash dumps are controlled by the browser/OS. Releasing references and wiping mutable buffers is not a guarantee of physical-memory erasure. Recipient recordings, copied text, screenshots and diagnostics cannot be erased by this app.

## Deployment and remaining risks

1. **Vercel:** use the Next.js preset, Node.js 22.x and HTTPS. No mandatory environment variables or durable application storage. Only connection configuration is served by an API. Public PeerJS signaling remains an availability dependency.
2. **Connectivity and IP privacy:** direct WebRTC exposes peers' public IPs to each other; STUN/signaling observe metadata. Optional TLS TURN supports `TURN_URLS`, server-only `TURN_SHARED_SECRET` and `WEBRTC_RELAY_ONLY=true`. Relay-only fails closed if misconfigured. STUN alone cannot guarantee connectivity on every network; no TURN service was available for live testing.
3. **Public relay abuse:** without accounts, temporary TURN credentials are available to anyone who can use the app. Same-origin checks reduce browser cross-site abuse, not arbitrary HTTP clients. The limiter is per warm instance, not global across Vercel. If enabling TURN, enforce Vercel Firewall limits and coturn user/total allocation quotas. Credentials expire within the maximum call lease plus one minute and cannot be centrally revoked on hangup without state. Default deployments have no app-funded relay.
4. **Endpoint trust:** CSP cannot protect against malicious app-delivered JavaScript, a compromised browser/OS, privileged extension or invited recipient. Audited/verifiable client distribution is needed for a stronger server-compromise threat model.
5. **Development advisory:** `braces` 3.0.3 has no published fixed release at review time; npm reports it through micromatch, fast-glob and Next's ESLint tooling. This is a development chain, not runtime request handling. Do not lint untrusted projects with privileged access. Downgrading Next to satisfy audit is not an acceptable fix. See [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
6. **Operations:** maintain Node/browser/dependencies, secure Vercel/domain access and avoid logging sensitive client diagnostics. Legacy local `data/*.json` files are no longer read/written; they may contain old room metadata, never a chat transcript from this implementation.

## Validation

The final follow-up review found and fixed a capture-lifetime bug in device reconnection: the original local stream could become unowned before `replaceTrack()` completed, so a failure/hangup could leave capture running. A replacement now has explicit ownership until synchronous commit, stays disabled during replacement, uses the latest mute choice, rejects overlapping replacements, and stops pending tracks immediately on teardown. Tests cover replacement failure, hangup while awaiting replacement, and late camera-permission completion.

Additional hardening rejects non-raw data channels, bounds outbound queues and oversized invitation input, clears pasted/pre-join invitations on navigation, and prevents late handshake work from restoring a cleared verification code. The crypto helper now rejects concurrent decryption attempts for the same sequence (defense in depth; the transport already serializes incoming packets) and rechecks expiry after cryptographic operations. Raw secret buffers are wiped even when imports fail. Remote audio and video are only attached for playback after authentication.

Audio review found silently swallowed playback failures and audio elements that changed with UI branches. There is now one persistent playback element, explicit handling of browser playback rejection/pause, and an **Enable call audio** user-action recovery button. Browser checks use a generated audio tone to verify nonzero incoming audio energy and active, unmuted playback in both peers; an intentionally rejected play request verifies recovery. This does not verify a user's physical speakers, OS volume, site mute setting, microphone permissions, or every Safari/mobile combination.

Controls now slide/fade with smooth preview-bound changes, remain inert while hidden, and respect reduced-motion preferences. Browser checks verify actual opacity/transform transitions and floating bounds.

Tests cover authentic exchange, directional encryption, media identity, wrong invite keys, role/peer/expiry substitution, original-host impersonation even with the secret, replay/tamper/reflection/cross-session rejection, disposal, bounded encrypted history, pending writes after exit, transport limits and TURN configuration. Browser checks use real PeerJS/WebRTC in separate Chromium contexts with synthetic media; they cannot establish compatibility with every device/network or replace a live Vercel check.

Final local results: all 26 automated tests, lint, TypeScript and the production build passed; the runtime dependency audit reported zero vulnerabilities. Two production browser sessions remained connected for 66 seconds with encrypted heartbeats, then exchanged chat with matching verification codes. Tests verified disabled outgoing tracks before authentication, ciphertext-only data traffic, third-guest refusal, hangup/navigation/back/tab-close/reload cleanup, capture shutdown, and floating-preview bounds with controls shown/hidden. Production CSP checks verified fresh nonces, hydration, blocked inline-script injection and stateless configuration with no environment variables. Desktop/mobile chat layouts were visually inspected. Vercel itself and a live TURN service were not deployed or tested in this review.

See README for commands. Primary references: [RFC 8827](https://www.rfc-editor.org/rfc/rfc8827.html), [W3C WebRTC](https://www.w3.org/TR/webrtc/), [W3C WebCrypto](https://www.w3.org/TR/WebCryptoAPI/), [Vercel request headers](https://vercel.com/docs/headers/request-headers), [coturn REST authentication](https://github.com/coturn/coturn/blob/master/README.turnserver), [Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), and installed Next.js 16.3.8 documentation.

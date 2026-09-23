# DESIGN.md — E-Meet 1-to-1 Video Calls

> **Does this make the conversation feel more natural, private, and effortless?**
> If yes, keep it. If it only makes the interface look more complicated, remove it.
> The product is a **quiet digital room for two people**, not conferencing software.

---

## 0. Hard rules (non-negotiable)

1. **No gradients.** No `linear-gradient`, no `radial-gradient`, no gradient text,
   no gradient buttons, no gradient avatars, no ambient color blobs. Depth comes
   from blur, borders, shadows, and motion — never from color blends.
2. **No purple, no blue.** The palette is monochrome + three semantic colors
   (emerald / amber / red). Accent actions are **white on black**.
3. **The call screen never scrolls.** It is a fixed-viewport shell (`100dvh`,
   `overflow: hidden`). Chrome floats over video and auto-hides. If content does
   not fit a 13" laptop viewport, the design is wrong, not the screen.
4. **No generated-looking decoration.** No hero mock-cards, no floating
   illustration clusters, no stat chips, no purple glow. One idea per screen.
5. **Sound and hover are features, not garnish.** Every control has a hover
   state, a press state, and (where it matters) a soft sound. All specified below.

---

## 1. Product vision

A calm, private 1-to-1 video call that feels like looking through glass —
present, quiet, human. Desktop, tablet, and mobile. Touch-first, mouse-polished.

Design keywords: `Quiet` · `Flat` · `Tactile` · `Alive` · `Private` · `Human`

---

## 2. Core principles

1. **Video is the room.** Remote video fills the viewport. UI is a guest on top
   of it, never beside it.
2. **Chrome appears on demand.** Header and controls fade in on mouse movement,
   hover near edges, touch, or keyboard input — and fade out after ~3.5s of
   stillness during a call. The cursor hides with them on fine-pointer devices.
3. **Flat surfaces, glass controls.** Cards are flat (`#101014`). Only floating
   call chrome (dock, self-preview frame, toasts, sheets) is glass.
4. **Motion answers touch.** Every state change animates with purpose:
   connecting breathes, joining resolves from blur, leaving dissolves.
5. **Sound confirms action.** Mute, unmute, join, leave, connect, and errors each
   have a short synthesized tone (see §8). Never silent, never noisy.
6. **Trust is quiet.** A small lock + "Private" label. Crypto details live one
   tap away in More — never on the stage.

---

## 3. Color system (flat, monochrome + semantic)

```css
:root {
  --background: #0a0a0b;        /* app canvas */
  --surface: #131316;           /* flat cards */
  --surface-elevated: #1b1b1f;  /* sheets, dock */
  --surface-hover: #232328;     /* hover fill */

  --text-primary: #f5f5f4;
  --text-secondary: #a8a8ad;
  --text-muted: #6e6e75;

  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);

  --action: #f5f5f4;            /* primary buttons: white bg, black text */
  --action-ink: #0a0a0b;

  --live: #34d399;              /* connected / speaking */
  --warn: #f5b942;              /* waiting / enable-audio nudge */
  --danger: #ff5f6d;            /* end call / destructive / muted mic */
}
```

Rules:

- Primary action = white button, black text. Secondary = flat elevated surface.
  Destructive = flat red. Nothing else gets a "brand color".
- Status is never color-alone: always pair dot + label text (§34 accessibility).
- Camera-off placeholders are flat `#131316` with a neutral avatar, not a tint.
- Focus ring is white (`outline: 2px solid #f5f5f4`).

---

## 4. Typography

System sans only. No display font, no webfont dependency beyond what ships.

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
```

Scale: Display 40–56 · H1 32–40 · H2 24–28 · H3 18–20 · Body 15–16 ·
Small 13–14 · Caption 11–12. Hierarchy through weight (500/600/700), not size.

Room codes and security codes are monospace, uppercase, letter-spaced.

---

## 5. Spacing & radius

4px base: `4 8 12 16 20 24 32 48`. Card padding 20–24. Section gaps 16–24.

Radius: small 10 · button 14 · card 20 · video/stage 24 · sheet top 24 · pill 999.
Call chrome is always pill or circle. Video corners are large and soft.

---

## 6. App structure

```
Home (start / join / recent)
  → Waiting (host, pre-join calm check)
  → Stage (active call — fixed viewport, chrome overlays)
  → Ended (quiet receipt → home)
```

No auth screens, no sidebars, no dashboards. More/Settings live in a bottom
sheet inside the call.

---

## 7. Home

One column on mobile, two on desktop. No mock video composition, no feature
grid.

- Top: wordmark + "Private" lock label. Nothing else.
- Headline: "Talk face to face. Anywhere." + one supporting line.
- Card 1 — Start: one sentence, one white button ("Start a call").
- Card 2 — Join: one input (monospace code), one secondary button.
- Recent: up to 5 rows (avatar initial, code, hosted/joined + date). Empty state:
  "No recent calls yet."
- Footer line: lock + "Media flows directly between you two. Nothing is stored."

---

## 8. Sound design (synthesized, no assets)

All tones are WebAudio oscillator envelopes: sine/triangle, 80–120ms, low gain
(≤0.08), with a master toggle persisted as `emeet_sound` (default ON). Never
autoplay before first user gesture. Honor `prefers-reduced-motion` by also
muting ambient/confirm sounds (keep error tone).

| Event       | Sound                                   |
| ----------- | --------------------------------------- |
| Connected   | soft two-note up (E5 → A5, sine)        |
| Peer joined | single warm blip (A5, triangle, 90ms)   |
| Peer left   | single descending blip (A4, 110ms)      |
| Mute        | short low click (220Hz square, 60ms)    |
| Unmute      | short higher click (440Hz, 60ms)        |
| Call ended  | gentle three-note down (A5 F5 D5)       |
| Error       | dull thud (140Hz, 150ms, lowpass)       |
| Copy link   | tiny tick (1200Hz, 40ms, very quiet)    |

Rules: one sound per event, never overlapping chimes; dock taps themselves stay
silent except mute/unmute (the action IS the feedback). A "Sounds on/off" row
sits in the More sheet.

---

## 9. Hover & tactile language (mouse-first polish)

Every interactive element implements all four layers:

1. **Hover (fine pointer):** surface lightens to `--surface-hover`, border
   brightens to `--border-strong`, element lifts `scale(1.04)` over 150ms
   (`cubic-bezier(0.2, 0.8, 0.2, 1)`). Dock buttons grow a soft white ring
   (`box-shadow: 0 0 0 4px rgba(255,255,255,0.08)`).
2. **Tooltip:** icon-only controls show a label tooltip above the control after
   ~400ms hover (CSS-only, `data-tip` attribute). Touch devices never depend on
   tooltips — labels exist in the More sheet.
3. **Press:** `scale(0.94)` + 60ms. Release springs back. Haptic `vibrate(10)`
   on supported mobile.
4. **Focus:** visible white outline for keyboard users; full tab order
   (dock → header → sheet), `aria-label` on every icon button, Esc closes sheets.

Cursor discipline: default arrow everywhere; `pointer` only on controls;
during hidden-chrome call state the cursor disappears over the stage
(`cursor: none`) and returns with the chrome.

---

## 10. Glass finish (where, exactly)

Glass = `rgba(18,18,22,0.72)` + 1px `var(--border-subtle)` + `blur(20px)`.
Used ONLY on: call dock, floating self-preview label strip, top overlay pills,
toasts, bottom sheet. Never on: page cards, inputs, waiting room, hero, text
over video (use scrim: flat `rgba(0,0,0,0.45)` behind labels instead).

Performance: at most two `backdrop-filter` surfaces visible during a call
(dock + one pill row). Self-preview video element itself is never blurred.

---

## 11. Auto-hiding chrome (choreography)

States: `VISIBLE` ↔ `HIDDEN`. Only during `connected`.

- Hide after 3500ms without mousemove / touch / keydown.
- Show instantly on: mousemove, touchstart, keydown, incoming toast,
  audio-blocked prompt, peer speaking after 10s silence? No — audio never
  forces chrome (sound is the signal).
- Transition: opacity + translateY(8px), 300ms emphasized ease. Header drifts
  up, dock drifts down. Cursor fades with them.
- When hidden, a 64px "hover strip" at the bottom still reveals on hover
  (desktop) so users never hunt for controls.
- Waiting / connecting / error / ended states: chrome is ALWAYS visible.
  Auto-hide applies to the stage only.

---

## 12. Waiting room (host)

Calm, single card, scrolls if the viewport is short (never clips):

- Large local preview (16:9, rounded 20), camera-off → flat avatar placeholder.
- Mic + camera circular toggles with live mic meter dots.
- "Waiting for guest" pill (amber, pulsing dot) + one-line instruction.
- Invite link in a flat code box + white "Copy invite link" button.

---

## 13. Active stage (the room)

Fixed shell: `height: 100dvh; overflow: hidden`. Layers:

1. Remote video: absolute fill, `object-fit: cover`, muted element (voice goes
   to the hidden audio element). Join transition: blur 6px → 0, opacity 0 → 1,
   scale 0.98 → 1, 450ms. Leave: blur + fade 250ms, then avatar placeholder.
2. Scrim labels: top-left presence pill (Guest/Host + Live + peer voice dots),
   top-right self state flags. Flat black scrim, 11px text.
3. Self-preview: absolute bottom-right above dock zone, 112–192px wide by
   breakpoint, 16:9, radius 16, strong border, mirrored. Label strip shows
   "You" + mute flag + mic dots.
4. Dock: absolute bottom center (above safe-area), glass pill, 4 controls:
   Mic · Camera · More · End (red). 52px targets, tooltips on hover.
5. Prompts: "Tap to enable audio" (amber pill, bottom center), peer-silence
   hint (small glass card, bottom-left, dismisses on speech).
6. Caption line ("Private call · nothing recorded") is part of the auto-hiding
   chrome — it leaves with the dock.

Remote-camera-off: flat placeholder with peer avatar + "Camera is off" (never
a frozen frame).

---

## 14. Ended / error states

Ended: centered avatar initial, "Call ended", one reassurance line, white
Rejoin + secondary Home. 300ms settle-in (rise 8px + fade).

Errors: centered card, plain-language title + one recovery sentence + white
"Try again" + secondary "Go home". Never raw codes (`peer-unavailable`,
`ICE failed`, HTTP numbers) in primary UI — map them (see §17).

---

## 15. Toasts

Bottom-center, above dock zone, glass pills, slide-up + fade 250ms, 2.6s
lifetime, max 3 stacked: "Link copied" · "Microphone muted/unmuted" ·
"Camera on/off" · "You're connected" · "Call ended" · "Connection restored".

---

## 16. Bottom sheet (More)

Mobile-first on all sizes, max-width 480px centered on desktop. Drag handle,
slide-up 300ms, scrim `rgba(0,0,0,0.6)`. Rows (44px+ each): security code card
(mono, read-aloud hint) · copy link · reconnect devices · sounds on/off ·
host-only delete (red tint) · leave (red fill). Audio-health diagnostics block
(mic dots + track state, peer dots + flowing/muted, connection + ICE).

---

## 17. Error copy map

| Technical cause              | Title                          | Body                                            |
| ---------------------------- | ------------------------------ | ----------------------------------------------- |
| permission denied            | Camera and mic are blocked     | Allow access in the browser, then try again.    |
| no device                    | No camera or mic found         | Check hardware, then try again.                 |
| device busy                  | Camera or mic is busy          | Close other call apps and try again.            |
| peer unavailable / offline   | Couldn't reach the other person| Ask them to open the link and keep it open.    |
| room full                    | This call is full              | Calls are 1-to-1 — only two can join.           |
| deleted (410)                | Room no longer exists          | Codes are never reused — ask for a fresh link.  |
| signaling / network          | Connection is unstable         | Move closer to Wi-Fi, then retry.               |

---

## 18. Responsive contract (no-overflow guarantee)

- `xs <480 · sm 480–767 · md 768–1023 · lg 1024–1439 · xl 1440+`.
- Call shell: fixed `100dvh`, zero page scroll at every breakpoint. Self-preview
  width: 112 (xs) → 144 (sm) → 192 (md+). Dock fits 360px wide screens.
- Waiting/ended/error/home: normal flow, `min-height: 100dvh`, internal scroll
  only inside the card column if needed. Test matrix: 1366×768 laptop (the
  reported overflow), 360×640 phone, 768×1024 tablet, 1920×1080 desktop.
- Safe areas on all floating chrome. 44px minimum targets. One-hand reach:
  dock bottom-center on mobile.

---

## 19. Motion tokens

```
fast 150 (press/hover) · normal 250 (toasts/dock) · slow 400 (join/sheet)
ease-standard: cubic-bezier(0.2,0.8,0.2,1)
ease-emphasized: cubic-bezier(0.16,1,0.3,1)
```

Signature set only: breathe (connecting pulse ring) · resolve (join
blur→focus) · dissolve (leave) · rise (cards/toasts) · pop (mic toggle 180ms).
Ambient motion is FORBIDDEN on the call screen (performance + realism); the
only loops are the connecting pulse and speaking dots.

---

## 20. Accessibility

WCAG AA: keyboard map (M mic · C camera · E leave · Esc close), visible focus,
screen-reader labels on all icon buttons, live-region toasts, status text
never color-only, `prefers-reduced-motion` kills loops + sounds confirm-only.

---

## 21. Performance

No backdrop-filter over video pixels. No animation loops during calls except
pulse/dots. Video elements outside reactive subtrees. 60fps hover transforms
only (transform/opacity). Mid-range Android is the bar.

---

## 22. Build order

1. Tokens + flat surfaces + type (done via globals)
2. Sounds engine + hover/tooltip primitives
3. Fixed call shell + overlay chrome + auto-hide
4. Waiting / ended / error states
5. Sheet + toasts + diagnostics
6. Breakpoint + overflow pass (1366×768 first)
7. A11y + reduced-motion + keyboard pass

## 23. Quality bar

- [ ] Zero gradients / zero purple-blue in the codebase
- [ ] 1366×768 call fits without scroll; dock never clips
- [ ] Chrome hides in 3.5s, returns on any input, cursor follows
- [ ] Every dock button: hover ring + tooltip + press scale + sound where specified
- [ ] Join/leave/mute/unmute/end each sound correct; toggle silences all
- [ ] Meters move when speaking on both ends; health panel reads true
- [ ] Reduced-motion + keyboard-only + touch-only passes all pass

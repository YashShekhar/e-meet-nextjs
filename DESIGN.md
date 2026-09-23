# DESIGN.md --- 1-to-1 Video Chat Application

## 1. Product Vision

Build a premium, modern 1-to-1 video communication experience that
feels:

-   Fast
-   Private
-   Minimal
-   Human
-   Cinematic
-   Responsive across desktop, tablet, and mobile
-   Native-like on mobile without looking like a stretched desktop
    website

The visual direction should feel like a combination of **modern
fintech + premium communication apps + futuristic spatial UI**, while
avoiding excessive glassmorphism, neon overload, or unnecessary
decoration.

### Design keywords

`Calm` · `Premium` · `Fluid` · `Immersive` · `Private` · `Futuristic` ·
`Human`

------------------------------------------------------------------------

# 2. Core Design Principles

## 2.1 Video is the hero

The remote participant should always be the visual priority.

Avoid UI that competes with the video.

## 2.2 Controls should disappear when not needed

During an active call, controls should be available but visually quiet.

-   Move mouse/touch → controls appear
-   Stay idle → controls fade away
-   Tap video → controls toggle on mobile
-   Important actions remain reachable

## 2.3 Motion should communicate state

Animations must have meaning.

Use motion for:

-   Connecting
-   Ringing
-   Joining
-   Muting
-   Camera state
-   Network quality
-   Participant joining/leaving
-   Call ending
-   Errors
-   Success states

Avoid animations that exist only for decoration.

## 2.4 Touch-first responsive design

The application must work naturally on:

-   Mobile portrait
-   Mobile landscape
-   Tablet portrait
-   Tablet landscape
-   Laptop
-   Desktop
-   Ultrawide monitor

Design mobile layouts independently rather than simply shrinking desktop
layouts.

------------------------------------------------------------------------

# 3. Visual Direction

## 3.1 Overall aesthetic

Use a dark-first premium interface.

Primary visual language:

-   Deep charcoal/black backgrounds
-   Soft gradients
-   Subtle borders
-   Large rounded corners
-   High-quality typography
-   Soft shadows
-   Controlled blur
-   Very subtle noise/grain
-   Large whitespace
-   Smooth transitions

Do not use heavy borders or dense dashboards.

------------------------------------------------------------------------

# 4. Color System

Use semantic design tokens instead of hardcoded colors.

``` css
:root {
  --background: #070709;
  --surface: #101014;
  --surface-elevated: #17171d;
  --surface-hover: #1d1d25;

  --text-primary: #f7f7f8;
  --text-secondary: #a5a5ad;
  --text-muted: #707078;

  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);

  --accent: #7c5cff;
  --accent-soft: rgba(124, 92, 255, 0.18);

  --success: #35d49a;
  --warning: #f5b942;
  --danger: #ff5f6d;
  --info: #54a8ff;
}
```

## Gradient language

Use gradients sparingly.

Example:

``` css
--gradient-accent:
  linear-gradient(135deg, #7c5cff 0%, #b65cff 100%);
```

For ambient backgrounds:

``` css
background:
  radial-gradient(
    circle at 20% 20%,
    rgba(124, 92, 255, 0.16),
    transparent 35%
  ),
  radial-gradient(
    circle at 80% 70%,
    rgba(84, 168, 255, 0.10),
    transparent 35%
  ),
  var(--background);
```

The gradient should feel like ambient lighting, not a colorful
wallpaper.

------------------------------------------------------------------------

# 5. Typography

Use a modern sans-serif.

Preferred stack:

``` css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

If using a custom font, prefer:

-   Inter
-   Geist
-   Manrope

## Typography scale

``` text
Display:     48–64px
H1:          36–48px
H2:          28–36px
H3:          20–24px
Body:        15–17px
Small:       13–14px
Caption:     11–12px
```

Use font weight rather than oversized text for hierarchy.

------------------------------------------------------------------------

# 6. Spacing System

Use a consistent 4px/8px-based spacing system.

``` text
4px
8px
12px
16px
20px
24px
32px
40px
48px
64px
80px
```

Recommended component padding:

``` text
Small control:     8–12px
Normal control:    12–16px
Card:              20–24px
Large section:     32–48px
```

------------------------------------------------------------------------

# 7. Border Radius

Use generous but controlled rounding.

``` text
Small:       10px
Button:      12–14px
Card:        18–24px
Video:       20–28px
Modal:       24–32px
Pill:        999px
```

The call interface should feel soft and approachable.

------------------------------------------------------------------------

# 8. Application Structure

## Primary screens

``` text
Landing / Welcome
        ↓
Authentication
        ↓
Home
        ↓
Create / Join Call
        ↓
Waiting Room
        ↓
Active Call
        ↓
Call Ended
        ↓
Home
```

Optional:

``` text
Profile
Settings
Call History
Privacy
Devices
Appearance
Notifications
```

------------------------------------------------------------------------

# 9. Landing Page

The landing page should immediately communicate:

> "Talk to someone. Instantly."

## Hero

Large headline:

``` text
Talk face to face.
Anywhere.
```

Supporting text:

``` text
Simple, private 1-to-1 video conversations
without the clutter.
```

Primary CTA:

``` text
Start a call
```

Secondary CTA:

``` text
Join a call
```

## Hero visual

Show a stylized live-call composition:

-   Large participant video
-   Floating self-preview
-   Small call controls
-   Ambient gradient
-   Subtle animated background

The hero should have slow ambient motion.

------------------------------------------------------------------------

# 10. Home Screen

Desktop layout:

``` text
┌─────────────────────────────────────────────────────────┐
│ Logo                              Profile / Settings     │
│                                                         │
│                  Welcome back                           │
│           Ready to talk to someone?                     │
│                                                         │
│       ┌────────────────┐   ┌────────────────┐           │
│       │                │   │                │           │
│       │  Start Call    │   │  Join Call     │           │
│       │                │   │                │           │
│       └────────────────┘   └────────────────┘           │
│                                                         │
│                 Recent calls                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Mobile:

``` text
┌──────────────────────┐
│ Logo          Avatar │
│                      │
│ Hey there 👋         │
│ Ready to connect?    │
│                      │
│ ┌──────────────────┐ │
│ │   Start a Call   │ │
│ └──────────────────┘ │
│                      │
│ ┌──────────────────┐ │
│ │    Join Call     │ │
│ └──────────────────┘ │
│                      │
│ Recent               │
│ ───────────────────  │
│ Call history         │
└──────────────────────┘
```

------------------------------------------------------------------------

# 11. Join / Create Call

Keep the experience extremely simple.

## Create

``` text
Create a private call

Your room is ready.

[ Copy invite link ]

[ Start call ]
```

## Join

``` text
Join a call

Enter the invite code or link

[                    ]

[ Continue ]
```

Do not force unnecessary account creation before a call unless required
by the product.

------------------------------------------------------------------------

# 12. Waiting Room

The waiting room should feel calm and premium.

Layout:

``` text
┌─────────────────────────────────────────────┐
│                                             │
│              Camera Preview                 │
│                                             │
│         ┌──────────────────────┐            │
│         │                      │            │
│         │      Your video     │            │
│         │                      │            │
│         └──────────────────────┘            │
│                                             │
│              Yash                           │
│                                             │
│       🎙        📹        ⚙                 │
│                                             │
│              [ Join call ]                  │
│                                             │
└─────────────────────────────────────────────┘
```

Show:

-   Camera preview
-   Microphone toggle
-   Camera toggle
-   Device settings
-   Display name
-   Join button

------------------------------------------------------------------------

# 13. Active Call --- Core Experience

This is the most important screen.

## Desktop

Use a full-screen video stage.

``` text
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│                  REMOTE VIDEO                            │
│                                                          │
│                                                          │
│                             ┌───────────────┐            │
│                             │               │            │
│                             │ SELF PREVIEW  │            │
│                             │               │            │
│                             └───────────────┘            │
│                                                          │
│                                                          │
│                 ┌────────────────────────┐               │
│                 │ Mic Camera More Leave  │               │
│                 └────────────────────────┘               │
└──────────────────────────────────────────────────────────┘
```

## Video treatment

Remote video:

-   Full viewport
-   `object-fit: cover`
-   Rounded corners only where appropriate
-   Smooth transitions
-   Background fallback when camera is disabled

Self-preview:

-   Floating card
-   16:9 ratio
-   16--24px radius
-   Drag/reposition on desktop if desired
-   Safe-area-aware placement on mobile

------------------------------------------------------------------------

# 14. Call Controls

Primary controls:

``` text
Microphone
Camera
Speaker / Audio
More
End Call
```

Secondary controls may include:

``` text
Screen Share
Chat
Participants
Device Settings
Report
```

## Control style

Normal:

``` text
background: rgba(20,20,24,0.75)
backdrop-filter: blur(20px)
border: 1px solid rgba(255,255,255,0.08)
```

Use icon-only controls during the active call.

Buttons should have:

-   48--56px touch target
-   Circular shape for primary controls
-   High contrast icons
-   Tooltip on desktop
-   Haptic feedback where supported on mobile

------------------------------------------------------------------------

# 15. End Call Button

The end-call action should visually differ from normal controls.

Use:

``` text
Danger red
Circular button
High contrast phone-off icon
```

On desktop:

``` text
[ 🎙 ] [ 📹 ] [ ⋯ ] [ 🔴 ]
```

On mobile, use a bottom floating control dock.

------------------------------------------------------------------------

# 16. Mobile Call UI

Mobile should use the entire screen.

Portrait:

``` text
┌──────────────────────────┐
│ ● Connected       ⋯      │
│                          │
│                          │
│                          │
│      REMOTE VIDEO        │
│                          │
│                          │
│              ┌────────┐  │
│              │ SELF   │  │
│              └────────┘  │
│                          │
│                          │
│  🎙      📹      ⋯      🔴 │
└──────────────────────────┘
```

Use bottom safe-area padding:

``` css
padding-bottom: env(safe-area-inset-bottom);
```

Controls must remain reachable using one hand.

------------------------------------------------------------------------

# 17. Responsive Breakpoints

Recommended:

``` text
xs: < 480px
sm: 480–767px
md: 768–1023px
lg: 1024–1439px
xl: 1440px+
```

Do not rely only on breakpoints.

Also adapt based on:

-   Aspect ratio
-   Orientation
-   Available height
-   Safe areas
-   Input method
-   Pointer availability

------------------------------------------------------------------------

# 18. Motion Design

Motion is a major part of the product identity.

## Motion principles

Animation should be:

-   Fast when interacting
-   Slow when ambient
-   Smooth
-   Interruptible
-   Consistent

Suggested durations:

``` text
Micro interaction: 120–180ms
Normal transition: 180–280ms
Modal:             250–350ms
Page transition:   300–450ms
Ambient motion:    4–12 seconds
```

Recommended easing:

``` css
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);
```

------------------------------------------------------------------------

# 19. Signature Animations

## 19.1 Connecting animation

When connecting to another user:

``` text
Connecting
   •
  • •
 •   •
```

Use a soft pulsing radial animation.

Do not use an aggressive loading spinner.

## 19.2 Incoming call

Create an expanding pulse around the avatar/video.

``` text
       ◯
     ◯   ◯
   ◯   👤  ◯
     ◯   ◯
       ◯
```

The pulse should be subtle.

## 19.3 Participant joins

Remote video should transition:

``` text
blur → focus
opacity 0 → 1
scale 0.98 → 1
```

Duration:

``` text
300–500ms
```

## 19.4 Participant leaves

Use:

``` text
video → slight blur → fade
```

Then show a clean avatar state.

## 19.5 Mic mute

Animate the microphone icon with a tiny scale/bounce.

Avoid large distracting animations.

## 19.6 End call

Use a short:

``` text
scale down → fade
```

transition before returning to the home screen.

------------------------------------------------------------------------

# 20. Background Ambient Motion

The application can have very subtle animated gradient blobs.

Example:

``` text
Blob A:
x: 20% → 30% → 20%
y: 20% → 30% → 20%

Blob B:
x: 80% → 70% → 80%
y: 70% → 60% → 70%
```

Animation duration:

``` text
8–15 seconds
```

Keep opacity extremely low.

The user should notice the interface feels alive, not notice the
animation itself.

------------------------------------------------------------------------

# 21. Glass UI

Use glass effects selectively.

Good:

-   Call control dock
-   Self-preview
-   Settings panels
-   Floating notifications
-   Modal overlays

Avoid:

-   Every card being glass
-   Excessive blur
-   Text on low-contrast backgrounds
-   Glass over highly detailed video

Example:

``` css
.glass {
  background: rgba(18, 18, 22, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
```

------------------------------------------------------------------------

# 22. Component Design System

Create reusable components.

``` text
components/
├── Button
├── IconButton
├── Avatar
├── VideoTile
├── SelfPreview
├── CallControls
├── CallStatus
├── ConnectionIndicator
├── DeviceSelector
├── Modal
├── BottomSheet
├── Toast
├── Tooltip
├── Input
├── CopyButton
└── Skeleton
```

------------------------------------------------------------------------

# 23. Buttons

## Primary

Used for:

-   Start Call
-   Join Call
-   Continue

Style:

-   Accent gradient or solid accent
-   48px minimum height
-   12--14px radius
-   Strong typography

## Secondary

Used for:

-   Settings
-   Device selection
-   Copy link

Use muted surface background.

## Destructive

Used for:

-   End Call
-   Remove session
-   Leave

Use danger semantic color.

------------------------------------------------------------------------

# 24. Icons

Use one icon family consistently.

Recommended:

-   Lucide
-   Phosphor
-   Hugeicons

Do not mix multiple icon libraries.

Icons should generally be:

``` text
16px — inline
20px — standard
24px — buttons
28px — prominent controls
```

------------------------------------------------------------------------

# 25. Avatar System

Avatar states:

``` text
Online
Connecting
In call
Muted
Camera off
Offline
```

Use subtle status indicators.

Example:

``` text
● Online
● Connecting
● In call
```

Avoid large status badges.

------------------------------------------------------------------------

# 26. Connection Quality

Connection quality should be visible but unobtrusive.

Example:

``` text
Excellent   ●●●
Good        ●●○
Poor        ●○○
```

If connection becomes poor:

1.  Show subtle indicator
2.  Add small toast
3.  If persistent, show actionable message

Example:

``` text
Connection is unstable
Try moving closer to your Wi-Fi router.
```

Do not constantly display technical WebRTC information.

------------------------------------------------------------------------

# 27. Loading States

Never leave the user staring at a blank screen.

Use:

-   Skeletons
-   Soft shimmer
-   Pulsing avatar
-   Video placeholder
-   Animated status text

Example:

``` text
Finding your connection...
```

Then:

``` text
Connecting...
```

Then:

``` text
You're connected
```

------------------------------------------------------------------------

# 28. Error States

Errors should be human-readable.

Bad:

``` text
ICE_CONNECTION_FAILED
```

Good:

``` text
We couldn't connect the call.

Check your internet connection and try again.
```

CTA:

``` text
[ Try again ]
```

------------------------------------------------------------------------

# 29. Toast Notifications

Toasts should appear near the bottom center on desktop.

Mobile:

``` text
Bottom
Above safe area
```

Examples:

``` text
Link copied
Microphone muted
Camera turned off
Connection restored
Call ended
```

Use subtle slide + fade animations.

------------------------------------------------------------------------

# 30. Bottom Sheets

On mobile, prefer bottom sheets over desktop-style modal dialogs.

Use for:

-   More options
-   Device selection
-   Settings
-   Call details
-   Report

Animation:

``` text
translateY(100%) → translateY(0)
```

Duration:

``` text
250–350ms
```

Include drag handle.

------------------------------------------------------------------------

# 31. Desktop Navigation

Keep navigation minimal.

``` text
Logo
Home
Calls
Settings

                    Profile
```

Avoid complex sidebar navigation unless the application grows
significantly.

------------------------------------------------------------------------

# 32. Mobile Navigation

Use a compact bottom navigation only if multiple primary sections are
required.

Example:

``` text
Home     Calls     Settings
```

If the application is primarily about calling, navigation can be reduced
to:

``` text
Home + Profile
```

The call experience itself should have no persistent navigation.

------------------------------------------------------------------------

# 33. Dark / Light Theme

Dark mode should be the primary visual identity.

Light mode should still be supported.

Do not simply invert colors.

Light theme should use:

``` text
Warm white background
Soft gray surfaces
Dark typography
Subtle borders
Low-opacity shadows
```

Persist theme preference.

Support:

``` text
System
Light
Dark
```

------------------------------------------------------------------------

# 34. Accessibility

Target WCAG AA.

Requirements:

-   Keyboard navigation
-   Visible focus states
-   Screen-reader labels
-   Minimum 44×44px touch target
-   Sufficient text contrast
-   Do not rely only on color
-   Reduced motion support

Implement:

``` css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

------------------------------------------------------------------------

# 35. Microinteractions

Use tiny interactions throughout the application.

Examples:

### Copy button

``` text
Copy → ✓ Copied
```

### Toggle

``` text
Off → slide → On
```

### Hover

``` text
scale: 1 → 1.02
```

Keep hover effects subtle.

### Press

``` text
scale: 1 → 0.96
```

Return smoothly.

------------------------------------------------------------------------

# 36. Page Transitions

Use shared visual continuity.

Example:

``` text
Home
 ↓
Create Call
 ↓
Waiting Room
 ↓
Active Call
```

Avoid hard cuts.

Use:

``` text
opacity
transform
scale
blur
```

Do not animate large amounts of layout unnecessarily.

------------------------------------------------------------------------

# 37. Video Placeholder

When camera is disabled:

``` text
┌──────────────────────────┐
│                          │
│           👤             │
│        Yash              │
│                          │
└──────────────────────────┘
```

Use an avatar or initials.

Background can use a very subtle gradient derived from the avatar.

------------------------------------------------------------------------

# 38. Privacy / Trust UI

Because this is a private communication product, trust should be visible
without becoming technical.

During a call:

``` text
🔒 Private call
```

Optional expanded information:

``` text
Your connection is secure.
```

Do not expose cryptographic implementation details in the primary UI.

------------------------------------------------------------------------

# 39. Sound Design

Keep sound minimal.

Optional sounds:

-   Incoming call
-   Call connected
-   Call ended
-   Notification
-   Error

Sounds should be:

-   Short
-   Soft
-   Non-annoying
-   Disableable

Never autoplay unexpected audio on page load.

------------------------------------------------------------------------

# 40. Haptics

On supported mobile devices:

Use subtle haptic feedback for:

-   Call accepted
-   Mute toggle
-   Camera toggle
-   End call
-   Copy action

Never use strong vibration for normal interactions.

------------------------------------------------------------------------

# 41. Performance Rules

Video applications must prioritize performance.

Rules:

-   Avoid expensive continuous React re-renders
-   Keep video elements outside unnecessary render trees
-   Prefer GPU-friendly transforms
-   Avoid animating width/height where transform works
-   Avoid large backdrop-filter surfaces
-   Lazy-load non-call screens
-   Stop unnecessary animations when not visible
-   Respect reduced-motion preferences

During active calls, performance takes priority over decorative
animation.

------------------------------------------------------------------------

# 42. Mobile Performance

Optimize for mid-range Android devices.

Avoid:

-   Heavy blur everywhere
-   Multiple animated gradients
-   Large particle systems
-   Continuous canvas animations
-   Excessive shadows
-   Huge image assets

The call screen should remain smooth even while video encoding/decoding
is active.

------------------------------------------------------------------------

# 43. PWA / Installable Web App

If this is a web application, design it as a PWA.

Support:

-   Install prompt
-   Standalone mode
-   App icon
-   Splash screen
-   Offline shell
-   Mobile safe areas

Standalone mode should remove browser-like visual assumptions.

------------------------------------------------------------------------

# 44. Safe Area Handling

Always account for:

``` css
env(safe-area-inset-top)
env(safe-area-inset-right)
env(safe-area-inset-bottom)
env(safe-area-inset-left)
```

Especially for:

-   Call controls
-   Bottom sheets
-   Navigation
-   Self-preview
-   Toasts

------------------------------------------------------------------------

# 45. Design Tokens

Centralize tokens.

Example:

``` ts
export const designTokens = {
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
    pill: 999,
  },

  motion: {
    fast: 150,
    normal: 250,
    slow: 400,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  control: {
    minTouchTarget: 44,
    callControl: 52,
  },
};
```

------------------------------------------------------------------------

# 46. Recommended Animation Library

For React-based implementation:

### Preferred

**Framer Motion / Motion**

Use it for:

-   Page transitions
-   Modal transitions
-   Bottom sheets
-   Microinteractions
-   Shared layout animations
-   Presence animations

Use CSS transitions for simple state changes.

Do not put every CSS property under a JavaScript animation engine.

------------------------------------------------------------------------

# 47. Suggested Motion Patterns

## Fade + lift

``` text
opacity: 0 → 1
translateY: 8px → 0
```

## Scale entrance

``` text
opacity: 0 → 1
scale: 0.96 → 1
```

## Bottom sheet

``` text
translateY(100%) → translateY(0)
```

## Tooltip

``` text
opacity: 0 → 1
scale: 0.96 → 1
```

## Call connection pulse

Use a repeating radial scale animation.

------------------------------------------------------------------------

# 48. Empty States

Avoid empty dashboards.

Example:

``` text
No recent calls

Start a conversation and
your recent calls will appear here.

[ Start a call ]
```

Use a small illustration or abstract visual.

------------------------------------------------------------------------

# 49. Onboarding

Keep onboarding under 60 seconds.

Suggested flow:

``` text
Welcome
 ↓
Camera permission
 ↓
Microphone permission
 ↓
Display name
 ↓
Ready
```

Explain why permissions are required.

Example:

``` text
Camera access

Your camera lets the other person see you
during a video call.

[ Allow camera ]
```

------------------------------------------------------------------------

# 50. Permission Denied

Provide recovery instructions.

``` text
Camera access is blocked

Your browser has blocked camera access.

Open browser settings and allow camera access,
then try again.

[ Try again ]
```

Never trap the user in a dead-end state.

------------------------------------------------------------------------

# 51. Call States

Design every state explicitly.

``` text
IDLE
CONNECTING
RINGING
WAITING
CONNECTED
RECONNECTING
POOR_CONNECTION
REMOTE_CAMERA_OFF
LOCAL_CAMERA_OFF
LOCAL_MUTED
REMOTE_MUTED
ENDING
ENDED
FAILED
```

Each state should have:

-   Visual treatment
-   Animation
-   Text
-   Available actions

------------------------------------------------------------------------

# 52. Call State Visual Example

``` text
CONNECTING

        ◉
      ◉   ◉

Connecting...
```

``` text
CONNECTED

🔒 Private call

Remote video

[ Mic ] [ Camera ] [ More ] [ End ]
```

``` text
RECONNECTING

Connection lost

Trying to reconnect...

[ End call ]
```

------------------------------------------------------------------------

# 53. Design Anti-Patterns

Do NOT build:

-   Generic Bootstrap-looking UI
-   Huge permanent sidebars
-   Excessive gradients
-   Excessive glassmorphism
-   Neon cyberpunk everywhere
-   Tiny mobile buttons
-   Dense settings screens
-   Full-screen loading spinners
-   Too many modal dialogs
-   Unnecessary badges
-   Excessive shadows
-   Constant animations
-   Decorative particles during video calls

The product should feel premium, not visually noisy.

------------------------------------------------------------------------

# 54. Brand Personality

The product should communicate:

``` text
"Private, simple, and beautiful."
```

Not:

``` text
"Enterprise conferencing software."
```

Avoid visual patterns strongly associated with large corporate meeting
dashboards.

The experience should feel like a direct conversation rather than a
conference room.

------------------------------------------------------------------------

# 55. Example Design Language

Imagine this combination:

``` text
Background
    ↓
Deep black / charcoal

Ambient lighting
    ↓
Very subtle purple + blue gradients

Surface
    ↓
Dark elevated cards

Typography
    ↓
Clean geometric sans

Corners
    ↓
Large + soft

Controls
    ↓
Circular + floating

Motion
    ↓
Fast + smooth + purposeful

Video
    ↓
Full-screen + immersive

Overall
    ↓
Premium + futuristic + human
```

------------------------------------------------------------------------

# 56. Implementation Priority

Implement the design system in this order:

## Phase 1 --- Foundation

-   Colors
-   Typography
-   Spacing
-   Radius
-   Shadows
-   Motion tokens
-   Icons
-   Theme system

## Phase 2 --- Core Components

-   Button
-   IconButton
-   Avatar
-   Input
-   Modal
-   BottomSheet
-   Toast
-   VideoTile
-   CallControls

## Phase 3 --- Core Screens

-   Home
-   Create Call
-   Join Call
-   Waiting Room
-   Active Call
-   Call Ended

## Phase 4 --- Motion

-   Page transitions
-   Call connection animation
-   Video transitions
-   Control animations
-   Bottom sheets
-   Toasts

## Phase 5 --- Responsive

-   Mobile portrait
-   Mobile landscape
-   Tablet
-   Desktop
-   Ultrawide

## Phase 6 --- Accessibility

-   Keyboard
-   Screen readers
-   Contrast
-   Reduced motion
-   Touch targets

## Phase 7 --- Performance

-   Animation profiling
-   Video rendering profiling
-   Mobile performance
-   Memory usage
-   Network state handling

------------------------------------------------------------------------

# 57. Final Quality Bar

Before considering the UI complete, verify:

### Visual

-   [ ] Looks premium without excessive decoration
-   [ ] Consistent spacing
-   [ ] Consistent radius
-   [ ] Consistent icons
-   [ ] Strong typography hierarchy
-   [ ] Dark mode polished
-   [ ] Light mode polished

### Motion

-   [ ] Page transitions feel smooth
-   [ ] Call connection feels alive
-   [ ] Video joining/leaving is animated
-   [ ] Controls animate subtly
-   [ ] Reduced motion supported

### Mobile

-   [ ] One-hand friendly
-   [ ] 44px+ touch targets
-   [ ] Safe-area support
-   [ ] Portrait works
-   [ ] Landscape works
-   [ ] No browser-like feeling

### Video Call

-   [ ] Remote video is always the focus
-   [ ] Self-preview never blocks important content
-   [ ] Controls remain accessible
-   [ ] Camera-off state looks intentional
-   [ ] Mic-off state is obvious
-   [ ] Network problems are understandable

### Performance

-   [ ] No unnecessary continuous animations
-   [ ] No expensive effects during calls
-   [ ] Smooth interaction while video is active
-   [ ] Works on mid-range mobile devices

------------------------------------------------------------------------

# 58. Design North Star

Every design decision should answer this question:

> **Does this make the conversation feel more natural, private, and
> effortless?**

If yes, keep it.

If it only makes the interface look more complicated, remove it.

The final product should feel like a **beautiful digital room for two
people**, not a traditional video-conferencing dashboard.

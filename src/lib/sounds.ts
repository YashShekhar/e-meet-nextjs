// Tiny synthesized sound engine — no assets, WebAudio only (§8).
// All tones are short, soft confirmations. Default ON, persisted.

export type SoundName =
  | "connect"
  | "join"
  | "leave"
  | "mute"
  | "unmute"
  | "end"
  | "error"
  | "copy";

const KEY = "emeet_sound";

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx.state === "running" ? ctx : null;
  } catch {
    return null;
  }
}

type Step = {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
};

const SCORE: Record<SoundName, Step[]> = {
  connect: [
    { freq: 659, at: 0, dur: 0.1, type: "sine", gain: 0.06 },
    { freq: 880, at: 0.11, dur: 0.16, type: "sine", gain: 0.06 },
  ],
  join: [{ freq: 880, at: 0, dur: 0.09, type: "triangle", gain: 0.05 }],
  leave: [{ freq: 520, at: 0, dur: 0.11, type: "sine", gain: 0.05, slideTo: 380 }],
  mute: [{ freq: 220, at: 0, dur: 0.06, type: "triangle", gain: 0.05 }],
  unmute: [{ freq: 440, at: 0, dur: 0.06, type: "triangle", gain: 0.05 }],
  end: [
    { freq: 880, at: 0, dur: 0.09, type: "sine", gain: 0.05 },
    { freq: 698, at: 0.1, dur: 0.09, type: "sine", gain: 0.05 },
    { freq: 587, at: 0.2, dur: 0.18, type: "sine", gain: 0.05 },
  ],
  error: [{ freq: 140, at: 0, dur: 0.15, type: "sine", gain: 0.07 }],
  copy: [{ freq: 1200, at: 0, dur: 0.04, type: "sine", gain: 0.025 }],
};

export function playSound(name: SoundName) {
  try {
    if (!isSoundOn()) return;
    // Reduced motion: sound confirmations off, error tone kept.
    if (
      name !== "error" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + 0.01;
    for (const s of SCORE[name]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = s.type ?? "sine";
      osc.frequency.setValueAtTime(s.freq, t0 + s.at);
      if (s.slideTo) osc.frequency.exponentialRampToValueAtTime(s.slideTo, t0 + s.at + s.dur);
      const peak = s.gain ?? 0.05;
      g.gain.setValueAtTime(0, t0 + s.at);
      g.gain.linearRampToValueAtTime(peak, t0 + s.at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + s.at + s.dur);
      osc.connect(g).connect(c.destination);
      osc.start(t0 + s.at);
      osc.stop(t0 + s.at + s.dur + 0.05);
    }
  } catch {}
}

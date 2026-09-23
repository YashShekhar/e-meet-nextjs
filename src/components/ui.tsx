"use client";

import type { ReactNode } from "react";

/* ——— Design tokens (§45) ——— */
export const tokens = {
  radius: { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 },
  motion: { fast: 150, normal: 250, slow: 400 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  control: { minTouchTarget: 44, callControl: 52 },
} as const;

/* ——— Single icon family, Lucide-style stroke icons (§24) ——— */
type IconProps = { size?: number; className?: string };

function Base({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const Icons = {
  Mic: (p: IconProps) => (
    <Base {...p}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </Base>
  ),
  MicOff: (p: IconProps) => (
    <Base {...p}>
      <path d="M2 2l20 20" />
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 11 5.7M19 10a7 7 0 0 0-.8-3.2" />
      <path d="M12 17v4" />
    </Base>
  ),
  Video: (p: IconProps) => (
    <Base {...p}>
      <rect x="2" y="6" width="13" height="12" rx="3" />
      <path d="M15 10l7-3v10l-7-3" />
    </Base>
  ),
  VideoOff: (p: IconProps) => (
    <Base {...p}>
      <path d="M2 2l20 20" />
      <path d="M15 10l7-3v10l-4.5-1.8M10 6H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9" />
    </Base>
  ),
  PhoneOff: (p: IconProps) => (
    <Base {...p}>
      <path d="M10.7 13.6a15 15 0 0 1-3.1-3.1L5 8 3 9l1.5 3.5c1.4 3.2 4.3 6.1 7.5 7.5L15.5 21l1-2-2.3-2.4a15 15 0 0 1-3.5-3z" />
      <path d="M2 2l20 20" />
      <path d="M15 5l6 1 1 4c-.5 1-2 2-3.5 1.5L16 10l-1-5z" />
    </Base>
  ),
  Phone: (p: IconProps) => (
    <Base {...p}>
      <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </Base>
  ),
  More: (p: IconProps) => (
    <Base {...p}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Base>
  ),
  Copy: (p: IconProps) => (
    <Base {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </Base>
  ),
  Check: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 12.5l5 5L20 6.5" />
    </Base>
  ),
  Lock: (p: IconProps) => (
    <Base {...p}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Base>
  ),
  Refresh: (p: IconProps) => (
    <Base {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </Base>
  ),
  X: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  ),
  Trash: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </Base>
  ),
  Back: (p: IconProps) => (
    <Base {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Base>
  ),
  Settings: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
    </Base>
  ),
  User: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Base>
  ),
};

/* ——— Button (§23) ——— */
type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
};

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
  ariaLabel,
}: ButtonProps) {
  const styles =
    variant === "primary"
      ? "text-white shadow-[0_8px_30px_rgba(124,92,255,0.35)]"
      : variant === "danger"
        ? "bg-[var(--danger)] text-white"
        : variant === "ghost"
          ? "bg-transparent text-[var(--text-secondary)] hover:text-white border border-[var(--border-subtle)]"
          : "bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]";
  const bg =
    variant === "primary" ? "bg-[image:var(--gradient-accent)]" : "";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`pressable min-h-[48px] rounded-[14px] px-6 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${bg} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/* ——— IconButton — circular 52px call controls (§14) ——— */
export function IconButton({
  children,
  onClick,
  label,
  active = false,
  danger = false,
  off = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  danger?: boolean;
  off?: boolean;
  className?: string;
}) {
  const bg = danger
    ? "bg-[var(--danger)] text-white border-transparent"
    : off
      ? "bg-[var(--danger)] text-white border-transparent"
      : active
        ? "bg-white text-black border-transparent"
        : "glass text-white";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`pressable grid h-[52px] w-[52px] place-items-center rounded-full border border-[var(--border-subtle)] transition ${bg} ${className}`}
    >
      {children}
    </button>
  );
}

/* ——— Avatar (§25, §37) ——— */
export function Avatar({
  name = "?",
  size = 64,
  state = "idle",
}: {
  name?: string;
  size?: number;
  state?: "idle" | "connecting" | "live" | "muted" | "off";
}) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const ring =
    state === "live"
      ? "border-[var(--success)]"
      : state === "connecting"
        ? "connect-pulse border-[var(--accent)]"
        : "border-[var(--border-strong)]";
  return (
    <div
      className={`grid place-items-center rounded-full border-2 bg-[image:var(--gradient-accent)] font-semibold text-white ${ring}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

/* ——— Status pill (§26, §51) ——— */
export function StatusPill({
  tone = "neutral",
  children,
  pulse = false,
}: {
  tone?: "neutral" | "live" | "warn" | "danger" | "info";
  children: ReactNode;
  pulse?: boolean;
}) {
  const bg =
    tone === "live"
      ? "bg-[var(--success)] text-[#06281d] border-transparent"
      : tone === "warn"
        ? "bg-[var(--warning)] text-[#2d1f00] border-transparent"
        : tone === "danger"
          ? "bg-[var(--danger)] text-white border-transparent"
          : tone === "info"
            ? "bg-[var(--info)] text-[#04182e] border-transparent"
            : "glass text-[var(--text-secondary)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${bg}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "soft-ping" : ""}`}
      />
      {children}
    </span>
  );
}

/* ——— Toasts (§29) ——— */
export type Toast = { id: number; text: string };

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-in glass rounded-full px-4 py-2 text-[13px] font-medium text-white shadow-lg"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

let toastSeq = 1;
export function pushToast(
  set: React.Dispatch<React.SetStateAction<Toast[]>>,
  text: string
) {
  const id = toastSeq++;
  set((prev) => [...prev.slice(-2), { id, text }]);
  setTimeout(() => set((prev) => prev.filter((t) => t.id !== id)), 2600);
}

/* ——— Bottom sheet (§30) ——— */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label={title}>
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        className="sheet-in absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg rounded-t-[24px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="pressable grid h-9 w-9 place-items-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)]"
          >
            <Icons.X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ——— Video placeholder (§37) ——— */
export function VideoPlaceholder({
  name,
  caption,
  connecting = false,
}: {
  name: string;
  caption: string;
  connecting?: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_40%,rgba(124,92,255,0.16),transparent_60%),var(--surface)] p-8 text-center">
      <Avatar name={name} size={72} state={connecting ? "connecting" : "idle"} />
      <p className="text-sm font-semibold text-white">{name}</p>
      <p className="max-w-[26ch] text-xs leading-5 text-[var(--text-secondary)]">
        {caption}
      </p>
    </div>
  );
}

/* ——— Audio level dots — live voice meter (§26) ——— */
export function LevelDots({ level, label }: { level: number; label: string }) {
  const lit = Math.round(level * 5);
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full transition-all"
          style={{
            height: 6 + i * 3,
            background: i < lit ? "var(--success)" : "rgba(255,255,255,0.18)",
          }}
        />
      ))}
    </span>
  );
}

/* ——— Empty state (§48) ——— */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border border-[var(--border-subtle)] bg-white/[0.03] px-6 py-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icons.Phone size={22} />
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="max-w-[30ch] text-xs leading-5 text-[var(--text-secondary)]">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

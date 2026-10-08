"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./FloatingSelfView.module.css";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function FloatingSelfView({ aspectRatio, controlsHidden = false, compact = false, children }: {
  aspectRatio: number;
  controlsHidden?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  // Fractions of the available travel keep the preview in bounds on rotation,
  // viewport resizing, and changes to the camera's own aspect ratio.
  const [position, setPosition] = useState({ x: 1, y: 1 });
  const drag = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  return (
    <div className={`${styles.area} ${controlsHidden ? styles.expanded : ""} ${compact ? styles.compact : ""}`}>
      <div
        className={styles.preview}
        role="group"
        tabIndex={compact ? -1 : 0}
        aria-label="Your video. Drag to move, or use the arrow keys."
        title="Drag to move your video"
        style={{
          "--preview-ratio": aspectRatio,
          aspectRatio,
          left: `${(compact ? 1 : position.x) * 100}%`,
          top: `${(compact ? 1 : position.y) * 100}%`,
          transform: `translate(${-(compact ? 1 : position.x) * 100}%, ${-(compact ? 1 : position.y) * 100}%)`,
        } as CSSProperties}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || drag.current) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          drag.current = {
            pointerId: event.pointerId,
            offsetX: (event.clientX - bounds.left) / bounds.width,
            offsetY: (event.clientY - bounds.top) / bounds.height,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          const preview = event.currentTarget.getBoundingClientRect();
          const area = event.currentTarget.parentElement!.getBoundingClientRect();
          const travelX = area.width - preview.width;
          const travelY = area.height - preview.height;
          setPosition({
            x: travelX > 0 ? clamp((event.clientX - area.left - active.offsetX * preview.width) / travelX) : 0,
            y: travelY > 0 ? clamp((event.clientY - area.top - active.offsetY * preview.height) / travelY) : 0,
          });
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0], ArrowRight: [1, 0],
            ArrowUp: [0, -1], ArrowDown: [0, 1],
          };
          const direction = directions[event.key];
          if (!direction) return;
          event.preventDefault();
          event.stopPropagation();
          const step = event.shiftKey ? 0.1 : 0.025;
          setPosition((current) => ({
            x: clamp(current.x + direction[0] * step),
            y: clamp(current.y + direction[1] * step),
          }));
        }}
      >
        {children}
      </div>
    </div>
  );
}

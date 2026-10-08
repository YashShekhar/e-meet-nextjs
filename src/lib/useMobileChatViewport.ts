"use client";

import { useLayoutEffect, useRef } from "react";

/** Mobile keyboards resize/pan the visual viewport without resizing the page. */
export function useMobileChatViewport(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const mobile = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const viewport = window.visualViewport;
    let frame = 0;
    let unlock: (() => void) | undefined;

    const release = () => {
      delete element.dataset.mobileChat;
      delete element.dataset.compactChat;
      delete element.dataset.shortChat;
      for (const name of ["height", "width", "top", "left"]) {
        element.style.removeProperty(`--chat-viewport-${name}`);
      }
      unlock?.();
      unlock = undefined;
    };
    const update = () => {
      if (!mobile.matches) { release(); return; }
      if (!unlock) {
        const { scrollX, scrollY } = window;
        const root = document.documentElement;
        const alreadyLocked = root.classList.contains("mobile-chat-locked");
        root.classList.add("mobile-chat-locked");
        unlock = () => {
          if (!alreadyLocked) root.classList.remove("mobile-chat-locked");
          window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
        };
      }
      const height = viewport?.height ?? window.innerHeight;
      element.dataset.mobileChat = "true";
      element.dataset.compactChat = String(height <= 540);
      element.dataset.shortChat = String(height <= 340);
      element.style.setProperty("--chat-viewport-height", `${height}px`);
      element.style.setProperty("--chat-viewport-width", `${viewport?.width ?? window.innerWidth}px`);
      element.style.setProperty("--chat-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      element.style.setProperty("--chat-viewport-left", `${viewport?.offsetLeft ?? 0}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    mobile.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mobile.removeEventListener("change", schedule);
      release();
    };
  }, [active]);

  return ref;
}

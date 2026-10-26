/**
 * Slow, Low-Contrast Topographic Contour Background Field
 * Pauses automatically when the tab is hidden and renders a single static frame
 * under prefers-reduced-motion: reduce.
 */

import { prefersReducedMotion } from "./dom.js";

export function initContourBackground() {
  if (document.querySelector(".contour-backdrop")) {
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "contour-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const canvas = document.createElement("canvas");
  canvas.className = "contour-canvas";
  backdrop.appendChild(canvas);
  document.body.prepend(backdrop);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let animationFrameId = null;
  let phase = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFrame(phase);
  }

  function getStrokeColors() {
    const isDark = document.documentElement.dataset.theme === "dark";
    return {
      primary: isDark ? "rgba(167, 196, 160, 0.055)" : "rgba(35, 75, 53, 0.065)",
      accent: isDark ? "rgba(167, 196, 160, 0.10)" : "rgba(35, 75, 53, 0.11)"
    };
  }

  function drawFrame(t) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);

    const colors = getStrokeColors();
    const lineCount = 9;
    const spacing = height / (lineCount - 1);

    for (let i = 0; i < lineCount; i += 1) {
      const baseY = i * spacing;
      ctx.beginPath();
      ctx.lineWidth = i % 3 === 0 ? 1.15 : 0.75;
      ctx.strokeStyle = i % 3 === 0 ? colors.accent : colors.primary;

      for (let x = 0; x <= width + 40; x += 36) {
        const wave1 = Math.sin(x * 0.0022 + t + i * 0.55) * 28;
        const wave2 = Math.cos(x * 0.0048 - t * 0.65 + i * 0.9) * 14;
        const y = baseY + wave1 + wave2;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  function loop() {
    if (document.hidden || prefersReducedMotion()) {
      animationFrameId = null;
      return;
    }
    phase += 0.0022;
    drawFrame(phase);
    animationFrameId = requestAnimationFrame(loop);
  }

  function startOrStop() {
    if (prefersReducedMotion() || document.hidden) {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      drawFrame(phase);
      return;
    }
    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(loop);
    }
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", startOrStop);
  window.addEventListener("botanists:themechange", () => drawFrame(phase));

  startOrStop();
}

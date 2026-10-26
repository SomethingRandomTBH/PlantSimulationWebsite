/**
 * Core DOM & Motion Helpers
 */

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (error) {
    return false;
  }
}

export function isSubPage() {
  const path = window.location.pathname.replace(/\\/g, "/");
  return path.includes("/pages/");
}

export function resolveHref(relativeFromRoot) {
  if (!relativeFromRoot) return "#";
  if (
    relativeFromRoot.startsWith("#") ||
    relativeFromRoot.startsWith("http") ||
    relativeFromRoot.startsWith("/")
  ) {
    return relativeFromRoot;
  }
  return isSubPage() ? `../${relativeFromRoot}` : relativeFromRoot;
}

/**
 * Animates a numeric value inside an element with a smooth count-up effect.
 * Immediately sets the final formatted text when prefers-reduced-motion is active.
 */
export function animateNumberValue(element, targetValue, decimals = 2, durationMs = 520) {
  if (!element) return;

  const num = Number(targetValue);
  if (!Number.isFinite(num)) {
    element.textContent = String(targetValue);
    return;
  }

  const formattedFinal = decimals === 0 ? String(Math.round(num)) : num.toFixed(decimals);

  if (prefersReducedMotion() || durationMs <= 0) {
    element.textContent = formattedFinal;
    return;
  }

  const startTime = performance.now();
  const startValue = 0;

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = startValue + (num - startValue) * eased;

    if (progress < 1) {
      element.textContent =
        decimals === 0 ? String(Math.round(current)) : current.toFixed(decimals);
      requestAnimationFrame(tick);
    } else {
      element.textContent = formattedFinal;
    }
  }

  requestAnimationFrame(tick);
}

/**
 * Single Page Registry — The Botanists' Plant Simulation
 * Adding a new page requires only adding an entry here and creating its HTML file.
 */

export const SITE_META = {
  title: "The Botanists' Plant Simulation",
  instrumentCode: "EPIPREMNUM · RF-CONFORMAL · v2.4",
  homeHref: "mainPage.html",
  copyrightYear: 2026
};

export const PAGE_REGISTRY = [
  {
    id: "about",
    title: "About",
    telemetryCode: "MOD · 01",
    description: "Machine-learning architecture and empirical methodology for indoor plant simulation.",
    href: "pages/about.html",
    ctaLabel: "Inspect system overview",
    enabled: true,
    isPrimary: false,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  },
  {
    id: "planning",
    title: "Plan",
    telemetryCode: "MOD · 02",
    description: "Development roadmap from physiological literature curation to conformal calibration.",
    href: "pages/planning.html",
    ctaLabel: "View phase roadmap",
    enabled: true,
    isPrimary: false,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`
  },
  {
    id: "team",
    title: "Team",
    telemetryCode: "MOD · 03",
    description: "Interdisciplinary Computer Science and Plant Biotechnology engineering crew.",
    href: "pages/team.html",
    ctaLabel: "Meet the researchers",
    enabled: true,
    isPrimary: false,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
  },
  {
    id: "research",
    title: "Research",
    telemetryCode: "MOD · 04",
    description: "Liebig's Law of Minimum, light compensation thresholds, thermal curves, and soil moisture.",
    href: "pages/research.html",
    ctaLabel: "Read physiological notes",
    enabled: true,
    isPrimary: false,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
  },
  {
    id: "predict",
    title: "Predict Growth",
    telemetryCode: "FORECAST · 7D",
    description: "Run 7-day, 14-day, and 28-day Random Forest vine forecasts with Gemini botanical diagnostics.",
    href: "#predict",
    ctaLabel: "Launch growth instrument",
    enabled: true,
    isPrimary: true,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`
  }
];

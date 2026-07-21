/**
 * Feature flags — code-level toggles for non-core capabilities.
 *
 * Core chain (always ON):
 *   project → floor plan → hero + angles → vault → Auto-from-Vault deck (Minimal) → PDF
 *
 * Everything below defaults to OFF until it is verified end-to-end.
 * To enable a flag for development, change the value to `true` here.
 * Do NOT gate the same feature behind an env var — a single place of truth.
 */
export const FLAGS = {
  /** Animated / cinematic deck template (PLAY / SHARE LINK controls) */
  ANIMATED_DECK: false,

  /** AI Smart Deck mode (user drops their own images, no vault required) */
  AI_SMART_DECK: false,

  /** Custom Deck mode (manual slide builder) */
  CUSTOM_DECK: false,

  /**
   * DXF export — hidden until output has been verified to open at correct
   * scale in real AutoCAD / GstarCAD. A broken DXF is worse than no DXF.
   */
  DXF_EXPORT: false,

  /** Flythrough / video generation */
  FLYTHROUGH: false,
} as const;

export type FeatureFlag = keyof typeof FLAGS;

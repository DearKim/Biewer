// Minimal built-in styles. All classes are `bw-` prefixed; all tunables are
// `--bw-*` CSS variables so hosts can theme without touching internals.
// Injected once at runtime (opt out with injectStyles: false) and also emitted
// as dist/style.css for CSP-strict consumers.

export const BIEWER_CSS = `
.bw-view {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bw-view-bg, #000);
  color: var(--bw-fg, #e5e7eb);
  font: var(--bw-font, 12px/1.4 system-ui, sans-serif);
  user-select: none;
  touch-action: none;
}
.bw-canvas {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.bw-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.bw-overlay > * {
  pointer-events: auto;
}
.bw-focus-border {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--bw-focus-color, #0066ff);
}
.bw-scrollbar {
  position: absolute;
  top: 0;
  right: 0;
  width: var(--bw-scrollbar-width, 8px);
  height: 100%;
  z-index: 4;
  background: var(--bw-scrollbar-track, rgba(255, 255, 255, 0.08));
}
.bw-scrollbar-thumb {
  position: absolute;
  left: 0;
  width: 100%;
  background: var(--bw-scrollbar-thumb, rgba(255, 255, 255, 0.5));
  border-radius: var(--bw-scrollbar-width, 8px);
}
.bw-status {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px;
  pointer-events: none;
}
.bw-status--error {
  color: var(--bw-error-color, #f87171);
}
`;

const STYLE_ID = 'bw-injected-styles';
let injected = false;

/** Inject the built-in stylesheet once. Idempotent, safe in SSR-less DOM. */
export function injectStyles(): void {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) {
    injected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = BIEWER_CSS;
  document.head.appendChild(el);
  injected = true;
}

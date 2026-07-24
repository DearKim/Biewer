// Web Component adapter — <biewer-volume> custom element (3D volume rendering).
// One standard element covers Vue / Angular / Svelte / plain HTML.
// Importing this module (via wc/index) registers the element as a side effect.
import { createBiewerVolumeView } from '../core/volumeView';
import type { BiewerVolumeView, BiewerVolumeViewOptions } from '../core/volumeView';
import type { BiewerSource, VolumeData } from '../core/types';
import type { VolumeRenderMode } from '../core/render/volume3d';

const TAG = 'biewer-volume';

export class BiewerVolumeElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['mode', 'invert', 'opacity'];
  }

  private _view: BiewerVolumeView | null = null;
  private _source: BiewerSource | null = null;
  private _volume: VolumeData | null = null;
  private _connected = false;

  get source(): BiewerSource | null { return this._source; }
  set source(v: BiewerSource | null) {
    this._source = v;
    // a volume view is immutable per source: recreate on change
    if (this._view) { this._view.dispose(); this._view = null; }
    this._maybeCreate();
  }
  get volume(): VolumeData | null { return this._volume; }
  set volume(v: VolumeData | null) {
    this._volume = v;
    if (this._view) { this._view.dispose(); this._view = null; }
    this._maybeCreate();
  }

  connectedCallback(): void {
    this._connected = true;
    queueMicrotask(() => this._maybeCreate());
  }

  disconnectedCallback(): void {
    this._connected = false;
    this._view?.dispose();
    this._view = null;
  }

  private _maybeCreate(): void {
    if (this._view || !this._connected || (!this._source && !this._volume)) return;
    const opts: BiewerVolumeViewOptions = {
      source: this._source ?? undefined,
      volume: this._volume ?? undefined,
      mode: (this.getAttribute('mode') as VolumeRenderMode) || undefined,
      invert: this.hasAttribute('invert') ? this.getAttribute('invert') !== 'false' : undefined,
      opacity: this.hasAttribute('opacity') ? Number(this.getAttribute('opacity')) : undefined,
      onReady: (v) => this._emit('bw-ready', { dims: v.dims, spacing: v.spacing, min: v.min, max: v.max }),
      onError: (e) => this._emit('bw-error', e),
      onProgress: (p) => this._emit('bw-progress', p),
      onCameraChange: (c) => this._emit('bw-camera', c),
    };
    this._view = createBiewerVolumeView(this, opts);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this._view) return;
    if (name === 'mode' && value) this._view.setMode(value as VolumeRenderMode);
    else if (name === 'invert') this._view.setInvert(value != null && value !== 'false');
    else if (name === 'opacity' && value != null) this._view.setOpacity(Number(value) || 0.4);
  }

  // --- public imperative API (for host toolbars) ---
  setMode(m: VolumeRenderMode): void { this._view?.setMode(m); }
  setInvert(b: boolean): void { this._view?.setInvert(b); }
  setOpacity(o: number): void { this._view?.setOpacity(o); }
  resetCamera(): void { this._view?.setCamera({ azimuth: 0.6, elevation: 0.35, distance: 2.4 }); }
  getView(): BiewerVolumeView | null { return this._view; }

  private _emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

/** Register <biewer-volume>. Idempotent. Called automatically on import. */
export function defineBiewerVolume(tag = TAG): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tag)) customElements.define(tag, BiewerVolumeElement);
}

defineBiewerVolume();

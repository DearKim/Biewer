// Web Component adapter — <biewer-view> custom element.
// One standard element covers Vue / Angular / Svelte / plain HTML / server templates.
// Importing this module registers the element as a side effect.
import { createBiewerView } from '../core/view';
import type { BiewerView, BiewerSource, ToolController, PlaybackController, VolumeAxis } from '../core/types';

const TAG = 'biewer-view';

export class BiewerViewElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['video-step', 'axis', 'scrollbar'];
  }

  private _view: BiewerView | null = null;
  private _source: BiewerSource | null = null;
  private _tools: ToolController | undefined;
  private _playback: PlaybackController | undefined;
  private _connected = false;

  // --- object properties (set via JS, not attributes) ---
  get source(): BiewerSource | null {
    return this._source;
  }
  set source(v: BiewerSource | null) {
    this._source = v;
    if (this._view && v) this._view.setSource(v);
    else this._maybeCreate();
  }
  get tools(): ToolController | undefined {
    return this._tools;
  }
  set tools(v: ToolController | undefined) {
    this._tools = v; // bound at view creation (see _maybeCreate)
  }
  get playback(): PlaybackController | undefined {
    return this._playback;
  }
  set playback(v: PlaybackController | undefined) {
    this._playback = v;
  }

  connectedCallback(): void {
    this._connected = true;
    // Defer creation one microtask so synchronous property assignments
    // (el.tools = …; el.playback = …; el.source = …) are all in place first.
    queueMicrotask(() => this._maybeCreate());
  }

  disconnectedCallback(): void {
    this._connected = false;
    this._view?.dispose();
    this._view = null;
  }

  private _maybeCreate(): void {
    if (this._view || !this._connected || !this._source) return;
    this._view = createBiewerView(this, {
      source: this._source,
      tools: this._tools,
      playback: this._playback,
      axis: (this.getAttribute('axis') as VolumeAxis) || undefined,
      videoStep: numAttr(this, 'video-step'),
      scrollbar: this.hasAttribute('scrollbar'),
      onFrameChange: (i) => this._emit('bw-frame-change', i),
      onSourceReady: (info) => this._emit('bw-source-ready', info),
      onProgress: (p) => this._emit('bw-progress', p),
      onError: (e) => this._emit('bw-error', e),
      onActivate: () => this._emit('bw-activate', null),
    });
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this._view) return;
    if (name === 'axis' && value) this._view.setAxis(value as VolumeAxis);
    else if (name === 'video-step') this._view.setVideoStep(Number(value) || 1);
  }

  private _emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

function numAttr(el: HTMLElement, name: string): number | undefined {
  const v = el.getAttribute(name);
  return v == null ? undefined : Number(v);
}

/** Register <biewer-view>. Idempotent. Called automatically on import. */
export function defineBiewerView(tag = TAG): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tag)) customElements.define(tag, BiewerViewElement);
}

defineBiewerView();

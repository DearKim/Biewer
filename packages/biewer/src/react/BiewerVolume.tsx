import {
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  type CSSProperties,
  type Ref,
} from 'react';
import { createBiewerVolumeView } from '../core/volumeView';
import type { BiewerVolumeView as CoreVolumeView } from '../core/volumeView';
import type { BiewerSource, VolumeData, BiewerError, BiewerProgress } from '../core/types';
import type { VolumeRenderMode, VolumeCamera } from '../core/render/volume3d';

export interface BiewerVolumeProps {
  /** decode from a source … */
  source?: BiewerSource;
  /** … or hand in a decoded volume */
  volume?: VolumeData;
  mode?: VolumeRenderMode;
  window?: { lo: number; hi: number };
  opacity?: number;
  invert?: boolean;
  maxEdge?: number;
  onReady?: (v: VolumeData) => void;
  onError?: (e: BiewerError) => void;
  onProgress?: (p: BiewerProgress) => void;
  onCameraChange?: (c: VolumeCamera) => void;
  className?: string;
  style?: CSSProperties;
}

export const BiewerVolume = forwardRef(function BiewerVolume(props: BiewerVolumeProps, ref: Ref<CoreVolumeView>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CoreVolumeView | null>(null);
  const cb = useRef(props);
  cb.current = props;

  // (re)create the core view when the source/volume identity changes
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const view = createBiewerVolumeView(el, {
      source: cb.current.source,
      volume: cb.current.volume,
      mode: cb.current.mode,
      window: cb.current.window,
      opacity: cb.current.opacity,
      invert: cb.current.invert,
      maxEdge: cb.current.maxEdge,
      onReady: (v) => cb.current.onReady?.(v),
      onError: (e) => cb.current.onError?.(e),
      onProgress: (p) => cb.current.onProgress?.(p),
      onCameraChange: (c) => cb.current.onCameraChange?.(c),
    });
    viewRef.current = view;
    return () => { view.dispose(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey(props.source), props.volume]);

  // prop → setter reconciliation (no recreate)
  useEffect(() => { if (props.mode) viewRef.current?.setMode(props.mode); }, [props.mode]);
  useEffect(() => { if (typeof props.invert === 'boolean') viewRef.current?.setInvert(props.invert); }, [props.invert]);
  useEffect(() => { if (typeof props.opacity === 'number') viewRef.current?.setOpacity(props.opacity); }, [props.opacity]);
  useEffect(() => { if (props.window) viewRef.current?.setWindow(props.window.lo, props.window.hi); }, [props.window?.lo, props.window?.hi]);

  useImperativeHandle(ref, () => viewRef.current as CoreVolumeView, []);

  return <div ref={hostRef} className={props.className} style={props.style} />;
});

function sourceKey(s?: BiewerSource): string {
  if (!s) return 'none';
  if (s.kind === 'url') return 'url:' + (Array.isArray(s.url) ? s.url.join(',') : s.url);
  if (s.kind === 'file') return 'file:' + (Array.isArray(s.file) ? s.file.map((f) => f.name + f.size).join(',') : s.file.name + s.file.size);
  return 'buffer:' + (Array.isArray(s.data) ? s.data.length : 1);
}

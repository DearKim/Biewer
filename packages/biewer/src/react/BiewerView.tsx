import {
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { createBiewerView } from '../core/view';
import type {
  BiewerView as CoreView,
  BiewerSource,
  ToolController,
  PlaybackController,
  VolumeAxis,
  FrameSourceInfo,
  BiewerProgress,
  BiewerError,
} from '../core/types';

export interface BiewerViewProps {
  source: BiewerSource;
  tools?: ToolController;
  playback?: PlaybackController;
  /** controlled frame index (pair with onFrameChange) */
  frame?: number;
  defaultFrame?: number;
  axis?: VolumeAxis;
  videoStep?: number;
  scrollbar?: boolean;
  injectStyles?: boolean;
  onFrameChange?: (index: number) => void;
  onSourceReady?: (info: FrameSourceInfo) => void;
  onProgress?: (p: BiewerProgress) => void;
  onError?: (e: BiewerError) => void;
  onActivate?: () => void;
  className?: string;
  style?: CSSProperties;
  /** overlay slot — rendered above the canvas */
  children?: ReactNode;
}

export const BiewerView = forwardRef(function BiewerView(props: BiewerViewProps, ref: Ref<CoreView>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CoreView | null>(null);

  // keep callbacks fresh without recreating the core view
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const view = createBiewerView(el, {
      source: cb.current.source,
      tools: cb.current.tools,
      playback: cb.current.playback,
      frame: cb.current.frame,
      defaultFrame: cb.current.defaultFrame,
      axis: cb.current.axis,
      videoStep: cb.current.videoStep,
      scrollbar: cb.current.scrollbar,
      injectStyles: cb.current.injectStyles,
      onFrameChange: (i) => cb.current.onFrameChange?.(i),
      onSourceReady: (info) => cb.current.onSourceReady?.(info),
      onProgress: (p) => cb.current.onProgress?.(p),
      onError: (e) => cb.current.onError?.(e),
      onActivate: () => cb.current.onActivate?.(),
    });
    viewRef.current = view;
    // move the React-rendered overlay into the core's overlay slot
    const coreOverlay = el.querySelector('.bw-overlay');
    if (coreOverlay && overlayRef.current) coreOverlay.appendChild(overlayRef.current);
    return () => {
      view.dispose();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // prop → setter reconciliation
  useEffect(() => {
    viewRef.current?.setSource(props.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey(props.source)]);

  useEffect(() => {
    if (props.axis) viewRef.current?.setAxis(props.axis);
  }, [props.axis]);

  useEffect(() => {
    if (typeof props.frame === 'number') viewRef.current?.setFrame(props.frame);
  }, [props.frame]);

  useImperativeHandle(ref, () => viewRef.current as CoreView, []);

  return (
    <div ref={hostRef} className={props.className} style={props.style}>
      <div ref={overlayRef} className="bw-overlay-slot">
        {props.children}
      </div>
    </div>
  );
});

/** stable-ish key so setSource only fires on real source changes */
function sourceKey(s: BiewerSource): string {
  if (s.kind === 'url') return 'url:' + (Array.isArray(s.url) ? s.url.join(',') : s.url);
  if (s.kind === 'file') return 'file:' + (Array.isArray(s.file) ? s.file.map((f) => f.name + f.size).join(',') : s.file.name + s.file.size);
  return 'buffer:' + (Array.isArray(s.data) ? s.data.length : 1);
}

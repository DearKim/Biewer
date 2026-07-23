import { useRef } from 'react';
import { createPlaybackController, type PlaybackOptions } from '../core/controllers/playback';
import type { PlaybackController } from '../core/types';

/** Create a stable PlaybackController for the component's lifetime. */
export function useBiewerPlayback(options?: PlaybackOptions): PlaybackController {
  const ref = useRef<PlaybackController | null>(null);
  if (!ref.current) ref.current = createPlaybackController(options);
  return ref.current;
}

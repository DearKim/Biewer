// @deepnoid/biewer — framework-agnostic core entry.
// Registers built-in decoders as a side effect, then re-exports the public API.
import { registerBuiltins } from './decode/builtins';

// Built-in decoders (later registrations by the host win via registerDecoder).
registerBuiltins();

export { createBiewerView } from './view';
export { createVolume, frameSourceToVolume } from './volume';
export type { CreateVolumeOptions } from './volume';
export { createBiewerVolumeView } from './volumeView';
export type { BiewerVolumeView, BiewerVolumeViewOptions } from './volumeView';
export type { VolumeRenderMode, VolumeCamera, VolumeRenderState } from './render/volume3d';
export { createToolController } from './controllers/tool';
export type { ToolControllerOptions } from './controllers/tool';
export { createPlaybackController } from './controllers/playback';
export type { PlaybackOptions } from './controllers/playback';

export { setHttpClient, getHttpClient, createDefaultHttpClient, setWorkerFactory, getWorkerFactory } from './env';
export { registerDecoder, registeredDecoders } from './decode/registry';
export { injectStyles, BIEWER_CSS } from './styles';
export { defaultTransform } from './types';

export type * from './types';

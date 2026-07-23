// Ensures built-in decoders are registered regardless of which entry point
// (core / react / wc) pulled in the code. Each bundle registers into its own
// registry once; idempotent within a bundle.
import { registerDecoder } from './registry';
import { imageDecoder } from './image';

let done = false;

export function registerBuiltins(): void {
  if (done) return;
  done = true;
  registerDecoder(imageDecoder);
}

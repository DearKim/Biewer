// Ensures built-in decoders are registered regardless of which entry point
// (core / react / wc) pulled in the code. Each bundle registers into its own
// registry once; idempotent within a bundle.
import { registerDecoder } from './registry';
import { imageDecoder } from './image';
import { niftiDecoder } from './nifti';
import { dicomDecoder } from './dicom';
import { videoDecoder } from './video';
import { archiveDecoder } from './archive';

let done = false;

export function registerBuiltins(): void {
  if (done) return;
  done = true;
  // registerDecoder unshifts (newest wins); order here is cosmetic since the
  // sniffers key on disjoint magic bytes.
  registerDecoder(imageDecoder);
  registerDecoder(niftiDecoder);
  registerDecoder(dicomDecoder);
  registerDecoder(videoDecoder);
  registerDecoder(archiveDecoder);
}

// Decoder registry. Later-registered decoders win over built-ins (host override).
import type { BiewerDecoder, FormatHint, ResolvedFormat } from '../types';

const decoders: BiewerDecoder[] = [];

export function registerDecoder(decoder: BiewerDecoder): void {
  // newest first → wins over built-ins and earlier registrations
  decoders.unshift(decoder);
}

/** Find a decoder that claims the given bytes. */
export function resolveDecoder(
  bytes: Uint8Array,
  ctx: { filename?: string; hint?: FormatHint },
): BiewerDecoder | null {
  for (const d of decoders) {
    try {
      if (d.sniff(bytes, ctx)) return d;
    } catch {
      // a decoder's sniff throwing must not break resolution
    }
  }
  return null;
}

/** Names of registered decoders (debug/introspection). */
export function registeredDecoders(): string[] {
  return decoders.map((d) => d.name);
}

/** Which built-in ResolvedFormats currently have a decoder. Used only for messaging. */
export function knownFormats(): ResolvedFormat[] {
  return [...new Set(decoders.map((d) => d.name))] as ResolvedFormat[];
}

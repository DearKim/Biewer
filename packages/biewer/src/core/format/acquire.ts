// Acquire raw bytes from a BiewerSource (url / file / buffer). Abortable.
import type { BiewerSource, BiewerProgress, FormatHint } from '../types';
import { getHttpClient } from '../env';

export interface AcquiredInput {
  bytes: Uint8Array;
  filename?: string;
}

export interface Acquired {
  inputs: AcquiredInput[];
  hint?: FormatHint;
}

export async function acquire(
  source: BiewerSource,
  opts?: { signal?: AbortSignal; onProgress?: (p: BiewerProgress) => void },
): Promise<Acquired> {
  const signal = opts?.signal;
  const onProgress = opts?.onProgress;

  if (source.kind === 'url') {
    const urls = Array.isArray(source.url) ? source.url : [source.url];
    const http = getHttpClient();
    const inputs = await mapProgress(urls.length, onProgress, (report) =>
      urls.map((url, i) =>
        http
          .fetchBytes(url, { signal, onProgress: urls.length === 1 ? onProgress : undefined })
          .then((buf) => {
            report(i);
            return { bytes: new Uint8Array(buf), filename: filenameFromUrl(url) };
          }),
      ),
    );
    return { inputs, hint: source.format };
  }

  if (source.kind === 'file') {
    const files = Array.isArray(source.file) ? source.file : [source.file];
    const inputs = await mapProgress(files.length, onProgress, (report) =>
      files.map((file, i) =>
        file.arrayBuffer().then((buf) => {
          report(i);
          return { bytes: new Uint8Array(buf), filename: file.name };
        }),
      ),
    );
    return { inputs, hint: source.format };
  }

  // buffer
  const datas = Array.isArray(source.data) ? source.data : [source.data];
  return {
    inputs: datas.map((d) => ({ bytes: new Uint8Array(d), filename: source.name })),
    hint: source.format,
  };
}

async function mapProgress<T>(
  count: number,
  onProgress: ((p: BiewerProgress) => void) | undefined,
  build: (report: (i: number) => void) => Promise<T>[],
): Promise<T[]> {
  let done = 0;
  const report = (_i: number) => {
    done++;
    onProgress?.({ phase: 'fetch', loaded: done, total: count, ratio: count ? done / count : null });
  };
  return Promise.all(build(report));
}

function filenameFromUrl(url: string): string | undefined {
  try {
    const path = url.split('?')[0].split('#')[0];
    const name = path.split('/').pop();
    return name || undefined;
  } catch {
    return undefined;
  }
}

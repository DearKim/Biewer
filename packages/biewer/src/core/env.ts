// Module-level environment injection — the ONLY globals Biewer allows.
// Everything else is per-instance. (See CLAUDE.md API rules.)

import type { HttpClient, WorkerFactory, BiewerProgress } from './types';

// --- HTTP client ------------------------------------------------------------

/** Default fetch-based client with streamed progress. */
export function createDefaultHttpClient(opts?: {
  baseURL?: string;
  getToken?: () => string | Promise<string>;
  headers?: Record<string, string>;
}): HttpClient {
  const baseURL = opts?.baseURL ?? '';
  return {
    async fetchBytes(url, o) {
      const full = baseURL && !/^https?:\/\//.test(url) ? baseURL.replace(/\/$/, '') + '/' + url.replace(/^\//, '') : url;
      const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
      if (opts?.getToken) {
        const token = await opts.getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(full, { headers, signal: o?.signal });
      if (!res.ok) {
        const err: Error & { code?: string } = new Error(`HTTP ${res.status} for ${full}`);
        err.code = 'FETCH_FAILED';
        throw err;
      }
      const total = Number(res.headers.get('content-length')) || null;
      const report = o?.onProgress;
      if (!report || !res.body) {
        const buf = await res.arrayBuffer();
        report?.(progress('fetch', buf.byteLength, buf.byteLength));
        return buf;
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        report(progress('fetch', loaded, total));
      }
      const out = new Uint8Array(loaded);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.byteLength;
      }
      return out.buffer;
    },
  };
}

function progress(phase: BiewerProgress['phase'], loaded: number, total: number | null): BiewerProgress {
  return { phase, loaded, total, ratio: total ? Math.min(1, loaded / total) : null };
}

let httpClient: HttpClient = createDefaultHttpClient();

export function setHttpClient(client: HttpClient): void {
  httpClient = client;
}
export function getHttpClient(): HttpClient {
  return httpClient;
}

// --- Worker factory ---------------------------------------------------------

let workerFactory: WorkerFactory = {};

export function setWorkerFactory(factory: WorkerFactory): void {
  workerFactory = { ...workerFactory, ...factory };
}
export function getWorkerFactory(): WorkerFactory {
  return workerFactory;
}

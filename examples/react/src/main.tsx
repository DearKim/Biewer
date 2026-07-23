import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BiewerView, useBiewerTools, useBiewerPlayback } from '@deepnoid/biewer/react';
import type { BiewerSource, BiewerTool } from '@deepnoid/biewer';

// synthetic image stack — no external data needed
function useStack(count: number, size = 512): BiewerSource | null {
  const [source, setSource] = useState<BiewerSource | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const data: ArrayBuffer[] = [];
      for (let i = 0; i < count; i++) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d')!;
        const hue = (i / count) * 300;
        ctx.fillStyle = `hsl(${hue} 45% 12%)`;
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = `hsl(${hue} 80% 60%)`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 60 + (i / count) * 160, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#e5e7eb';
        ctx.font = 'bold 48px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1} / ${count}`, size / 2, size / 2 + 16);
        const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
        data.push(await blob.arrayBuffer());
      }
      if (alive) setSource({ kind: 'buffer', data, name: 'stack.png' });
    })();
    return () => {
      alive = false;
    };
  }, [count, size]);
  return source;
}

const TOOLS: BiewerTool[] = ['zoom', 'pan'];

function App() {
  const tools = useBiewerTools({ scope: 'all' });
  const playback = useBiewerPlayback({ mode: 'slice', speed: 12 });
  const source = useStack(24);
  const [frame, setFrame] = useState(0);

  const cellStyle = useMemo<React.CSSProperties>(
    () => ({ border: '1px solid #1f2937', borderRadius: 8, overflow: 'hidden' }),
    [],
  );

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 16 }}>Biewer — React adapter</h1>
      <p style={{ color: '#9ca3af', fontSize: 12 }}>
        <code>@deepnoid/biewer/react</code> · <code>useBiewerTools</code> · <code>useBiewerPlayback</code>. 두 뷰가 같은
        컨트롤러에 바인딩되어 함께 움직인다.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        {TOOLS.map((t) => (
          <button key={t} onClick={() => tools.setActiveTool(t)}>
            {t}
          </button>
        ))}
        <button onClick={() => tools.apply({ op: 'rotate', degrees: 90 })}>rotate</button>
        <button onClick={() => tools.apply({ op: 'invert' })}>invert</button>
        <button onClick={() => tools.apply({ op: 'reset' })}>reset</button>
        <button onClick={() => playback.play()}>▶ auto</button>
        <button onClick={() => playback.pause()}>⏸</button>
        <button onClick={() => playback.stop()}>⏹</button>
      </div>

      {source && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ ...cellStyle, height: 360 }}>
            <BiewerView
              source={source}
              tools={tools}
              playback={playback}
              frame={frame}
              onFrameChange={setFrame}
              style={{ height: '100%' }}
            />
          </div>
          <div style={{ ...cellStyle, height: 360 }}>
            <BiewerView source={source} tools={tools} playback={playback} style={{ height: '100%' }} />
          </div>
        </div>
      )}
      <p style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>frame {frame + 1} / 24</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

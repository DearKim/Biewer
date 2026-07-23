import { useRef } from 'react';
import { createToolController, type ToolControllerOptions } from '../core/controllers/tool';
import type { ToolController } from '../core/types';

/** Create a stable ToolController for the component's lifetime. */
export function useBiewerTools(options?: ToolControllerOptions): ToolController {
  const ref = useRef<ToolController | null>(null);
  if (!ref.current) ref.current = createToolController(options);
  return ref.current;
}

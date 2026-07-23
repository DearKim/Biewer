// Headless tool controller. Binds to N views; scope decides broadcast target.
// Contains NO rendering — views own their transform and apply ops/gestures.
import type {
  ToolController,
  ToolControllerState,
  ToolBindable,
  ToolScope,
  BiewerTool,
  ToolOp,
  ToolGesture,
  ViewTransformState,
} from '../types';

export interface ToolControllerOptions {
  scope?: ToolScope;
  enabledTools?: BiewerTool[];
}

export function createToolController(options: ToolControllerOptions = {}): ToolController {
  const scope: ToolScope = options.scope ?? 'all';
  const enabled = options.enabledTools ? new Set(options.enabledTools) : null;

  const bindables = new Map<string, ToolBindable>();
  const transforms = new Map<string, ViewTransformState>();
  const subs = new Set<(s: ToolControllerState) => void>();
  let activeTool: BiewerTool | null = null;
  let activeViewId: string | null = null;

  function isEnabled(t: BiewerTool | null): boolean {
    return t == null || !enabled || enabled.has(t);
  }

  function targets(sourceViewId?: string): ToolBindable[] {
    if (scope === 'all') return [...bindables.values()];
    const id = sourceViewId ?? activeViewId;
    const b = id ? bindables.get(id) : undefined;
    return b ? [b] : [];
  }

  function snapshot(): ToolControllerState {
    return {
      activeTool,
      activeViewId,
      views: Object.fromEntries(transforms),
    };
  }

  function notify(): void {
    const s = snapshot();
    for (const fn of subs) fn(s);
  }

  const ctrl: ToolController = {
    get scope() {
      return scope;
    },
    get activeTool() {
      return activeTool;
    },
    setActiveTool(t) {
      if (!isEnabled(t)) return;
      activeTool = t;
      notify();
    },
    apply(op: ToolOp) {
      for (const b of targets()) b.applyOp(op);
      // transforms refreshed via _notifyTransform from each view
    },
    reset() {
      for (const b of targets()) b.reset();
    },
    undo() {
      // measurement history — wired when measurement lands (per active view)
    },
    redo() {
      // measurement history — wired when measurement lands (per active view)
    },
    getState: snapshot,
    subscribe(fn) {
      subs.add(fn);
      fn(snapshot());
      return () => subs.delete(fn);
    },
    _attach(viewId, view) {
      bindables.set(viewId, view);
      transforms.set(viewId, view.getTransform());
      if (!activeViewId) activeViewId = viewId;
      notify();
    },
    _detach(viewId) {
      bindables.delete(viewId);
      transforms.delete(viewId);
      if (activeViewId === viewId) activeViewId = bindables.keys().next().value ?? null;
      notify();
    },
    _setActiveView(viewId) {
      if (activeViewId !== viewId) {
        activeViewId = viewId;
        notify();
      }
    },
    _gesture(sourceViewId, g: ToolGesture) {
      if (!isEnabled(g.tool)) return;
      for (const b of targets(sourceViewId)) b.applyGesture(g);
    },
    _notifyTransform(viewId, t) {
      transforms.set(viewId, t);
      notify();
    },
  };

  return ctrl;
}

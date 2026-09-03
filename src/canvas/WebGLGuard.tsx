import { Component, type ErrorInfo, type ReactNode, useMemo, useState } from 'react';

interface WebGLGuardProps {
  children: ReactNode;
}

interface WebGLErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}

interface WebGLErrorBoundaryState {
  failed: boolean;
}

/** Prevents a missing or broken WebGL implementation from becoming a blank canvas. */
export function WebGLGuard({ children }: WebGLGuardProps) {
  const [attempt, setAttempt] = useState(0);
  const supported = useMemo(() => canCreateWebGLContext(), [attempt]);
  const retry = () => setAttempt((value) => value + 1);

  if (!supported) return <WebGLUnavailable onRetry={retry} />;

  return (
    <WebGLErrorBoundary key={attempt} onRetry={retry}>
      {children}
    </WebGLErrorBoundary>
  );
}

/** Also used by React Three Fiber if context creation fails after the preflight. */
export function WebGLUnavailable({ onRetry = reloadPage }: { onRetry?: () => void }) {
  return (
    <div className="room-canvas flex h-full w-full items-center justify-center bg-[#f0ece4] px-6 py-10" role="alert">
      <div className="w-full max-w-[520px] rounded-2xl border border-[#ded5ca] bg-white/90 p-6 text-left shadow-[0_16px_45px_rgba(62,49,36,0.10)] backdrop-blur-sm sm:p-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#292724] text-lg text-white" aria-hidden="true">◇</div>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a0978e]">3D view unavailable</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[#312e2b]">Enable WebGL to view RoomCraft</h2>
        <p className="mt-2 text-sm leading-6 text-[#756d65]">
          This browser could not start the 3D renderer. Graphics acceleration or WebGL is disabled.
        </p>
        <ol className="mt-5 space-y-3 text-[13px] leading-5 text-[#5f5851]">
          <li><strong>1.</strong> Open <code>chrome://settings/system</code> and enable graphics acceleration.</li>
          <li><strong>2.</strong> Fully relaunch Chrome.</li>
          <li><strong>3.</strong> Open <code>chrome://gpu</code> and confirm WebGL is enabled.</li>
        </ol>
        <p className="mt-4 text-xs leading-5 text-[#968d84]">
          If this browser cannot enable WebGL, open RoomCraft in another current Chrome window with graphics acceleration available.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-lg bg-[#292724] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#44403c]"
        >
          Retry 3D view
        </button>
      </div>
    </div>
  );
}

class WebGLErrorBoundary extends Component<WebGLErrorBoundaryProps, WebGLErrorBoundaryState> {
  state: WebGLErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): WebGLErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RoomCraft could not start its WebGL renderer.', error, info);
  }

  render() {
    if (this.state.failed) return <WebGLUnavailable onRetry={this.props.onRetry} />;
    return this.props.children;
  }
}

function canCreateWebGLContext(): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const options: WebGLContextAttributes = { failIfMajorPerformanceCaveat: false };
    return Boolean(
      canvas.getContext('webgl2', options) ??
      canvas.getContext('webgl', options) ??
      canvas.getContext('experimental-webgl', options),
    );
  } catch {
    return false;
  }
}

function reloadPage() {
  window.location.reload();
}

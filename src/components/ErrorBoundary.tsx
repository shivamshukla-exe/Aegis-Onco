import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AegisOnco route failed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="glass-card mx-auto max-w-2xl rounded-3xl border border-rose-200 p-8" role="alert">
        <p className="font-mono-data text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600">Research view unavailable</p>
        <h1 className="mt-2 text-xl font-extrabold text-slate-800">The page could not be rendered safely.</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          No clinical action should be taken from this research demo. Reload the page or return to the command center.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign('/Aegis-Onco/')}
          className="mt-5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white"
        >
          Return to command center
        </button>
      </section>
    );
  }
}
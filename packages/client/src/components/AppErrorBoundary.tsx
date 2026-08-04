import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort recovery screen for the thesis demo.
 *
 * A WebGL, lazy-chunk or route render failure must never leave the examiner in
 * front of a blank page. The boundary keeps the failure understandable and
 * offers safe recovery actions without exposing tokens or internal state.
 */
export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the structured stack in the browser console for the developer while
    // the public UI only shows a short, non-sensitive diagnostic.
    console.error('Bingo Simulator render failure', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="grid min-h-dvh place-items-center bg-[#090816] px-5 py-10 text-white">
        <section className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#15132b] shadow-[0_30px_100px_-30px_rgb(0_0_0_/_0.95)]">
          <div className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 px-6 py-5 text-[#14091f]">
            <p className="text-[10px] font-black uppercase tracking-[0.24em]">
              Recupero automatico
            </p>
            <h1 className="mt-1 font-display text-3xl font-black">
              La sala non è stata caricata correttamente
            </h1>
          </div>

          <div className="space-y-5 p-6">
            <p className="max-w-xl text-sm leading-6 text-white/70">
              Il gioco ha intercettato un errore prima che potesse trasformarsi
              in una pagina vuota. Puoi riprovare il rendering oppure ricaricare
              completamente la sessione.
            </p>

            <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                Diagnosi sintetica
              </p>
              <p className="mt-2 break-words font-mono text-xs text-amber-200">
                {error.name}: {error.message || 'errore sconosciuto'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={this.retry}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#171229] transition hover:-translate-y-0.5"
              >
                Riprova la scena
              </button>
              <button
                type="button"
                onClick={this.reload}
                className="rounded-2xl border border-white/15 bg-white/6 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
              >
                Ricarica il gioco
              </button>
              <a
                href="/hub"
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-white/70 transition hover:text-white"
              >
                Torna alla piazza
              </a>
            </div>
          </div>
        </section>
      </main>
    );
  }
}

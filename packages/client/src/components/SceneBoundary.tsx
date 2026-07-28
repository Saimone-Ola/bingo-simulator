import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps a rendering failure inside the canvas.
 *
 * Anything that throws under an R3F <Canvas> - a missing asset, a driver that
 * refuses a WebGL context, a bad shader - unmounts the whole subtree and leaves
 * the player staring at a blank page with the HUD gone. This catches it and
 * shows something honest instead, while the surrounding chrome keeps working.
 */
interface Props {
  children: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export class SceneBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console -- the only channel available client side for now
    console.error('Scene failed to render', error, info.componentStack);
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-sm">
          <h2 className="text-lg font-semibold text-content-primary">
            Impossibile avviare la grafica 3D
          </h2>
          <p className="mt-2 text-sm text-content-secondary">
            Il tuo browser non è riuscito ad aprire il contesto WebGL. Prova ad aggiornare la
            pagina, ad abilitare l’accelerazione hardware o a usare un altro browser.
          </p>
        </div>
      </div>
    );
  }
}

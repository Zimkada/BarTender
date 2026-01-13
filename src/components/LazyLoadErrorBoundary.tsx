import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  maxRetries?: number;
  retryDelay?: number;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  isRetrying: boolean;
}

/**
 * Error Boundary spécialisé pour les erreurs de lazy loading
 * Gère automatiquement les retry avec exponential backoff
 *
 * @example
 * <LazyLoadErrorBoundary maxRetries={3}>
 *   <Suspense fallback={<LoadingFallback />}>
 *     <Outlet />
 *   </Suspense>
 * </LazyLoadErrorBoundary>
 */
export class LazyLoadErrorBoundary extends Component<Props, State> {
  private retryTimeout?: NodeJS.Timeout;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Vérifier si c'est une erreur de lazy loading (chunk load failure)
    const isChunkLoadError =
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed') ||
      error.message.includes('error loading dynamically imported module') ||
      error.message.includes('ERR_CONNECTION_TIMED_OUT');

    if (isChunkLoadError) {
      return {
        hasError: true,
        error,
      };
    }

    // Si ce n'est pas une erreur de chunk, laisser l'ErrorBoundary parent gérer
    throw error;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[LazyLoadErrorBoundary] Chunk load error caught:', {
      error: error.message,
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount,
    });

    // Auto-retry si on n'a pas atteint la limite
    const maxRetries = this.props.maxRetries ?? 3;
    if (this.state.retryCount < maxRetries) {
      this.scheduleRetry();
    }
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  scheduleRetry = () => {
    const { retryDelay = 1000 } = this.props;
    const { retryCount } = this.state;

    // Exponential backoff: 1s, 3s, 10s
    const delays = [1000, 3000, 10000];
    const delay = delays[retryCount] || retryDelay;

    console.log(`[LazyLoadErrorBoundary] Scheduling retry ${retryCount + 1} in ${delay}ms`);

    this.setState({ isRetrying: true });

    this.retryTimeout = setTimeout(() => {
      this.handleRetry();
    }, delay);
  };

  handleRetry = () => {
    console.log('[LazyLoadErrorBoundary] Retrying...');

    this.setState((prevState) => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1,
      isRetrying: false,
    }));

    this.props.onRetry?.();
  };

  handleManualRetry = () => {
    console.log('[LazyLoadErrorBoundary] Manual retry triggered');

    this.setState({
      hasError: false,
      error: null,
      retryCount: 0,
      isRetrying: false,
    });

    this.props.onRetry?.();
  };

  handleGoBack = () => {
    window.history.back();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, retryCount, isRetrying } = this.state;
    const { children, fallback, maxRetries = 3 } = this.props;

    if (hasError) {
      // Si un fallback personnalisé est fourni
      if (fallback) {
        return fallback;
      }

      // Auto-retry en cours
      if (isRetrying && retryCount < maxRetries) {
        return (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-4 max-w-md px-4">
              <div className="flex justify-center">
                <RefreshCw className="w-12 h-12 text-amber-500 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800">
                Chargement lent, patientez...
              </h2>
              <p className="text-gray-600">
                Tentative {retryCount + 1}/{maxRetries}
              </p>
              <p className="text-sm text-gray-500">
                La connexion semble instable. Nous réessayons automatiquement.
              </p>
            </div>
          </div>
        );
      }

      // Échec après tous les retry
      return (
        <div className="flex items-center justify-center min-h-[50vh] px-4">
          <div className="text-center space-y-6 max-w-md">
            <div className="flex justify-center">
              <AlertTriangle className="w-16 h-16 text-red-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-800">
                Impossible de charger la page
              </h2>
              <p className="text-gray-600">
                La connexion réseau semble instable ou le serveur est temporairement indisponible.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700 font-mono break-all">
                  {error instanceof Error
                    ? error.message
                    : typeof error === 'string'
                    ? error
                    : JSON.stringify(error)}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={this.handleManualRetry}
                variant="default"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Réessayer
              </Button>

              <Button
                onClick={this.handleGoBack}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </Button>

              <Button
                onClick={this.handleReload}
                variant="ghost"
                className="text-sm"
              >
                Recharger la page
              </Button>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                💡 Astuce : Vérifiez votre connexion internet et réessayez.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

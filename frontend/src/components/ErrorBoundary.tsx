import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component to catch errors in lazy-loaded components
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);

    const errorMessage = error?.message || '';
    const isChunkError =
      errorMessage.includes('dynamically imported module') ||
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('Importing a module script failed') ||
      errorMessage.includes('Loading chunk') ||
      error?.name === 'ChunkLoadError';

    if (isChunkError) {
      const reloadKey = 'global_chunk_reload_attempted';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      }
    }
  }

  handleReload = () => {
    // Clear all retry markers on explicit user reload click
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('lazy_retry_') || key.includes('chunk') || key.includes('preload')) {
          sessionStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore sessionStorage access errors
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || '';
      const isChunkError =
        errorMessage.includes('dynamically imported module') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('Importing a module script failed') ||
        errorMessage.includes('Loading chunk') ||
        this.state.error?.name === 'ChunkLoadError';

      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="text-center p-8 max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {isChunkError ? 'App Update Available' : 'Something went wrong'}
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                {isChunkError
                  ? 'A new version of the app is available or your connection was briefly interrupted. Reloading will get you back on track.'
                  : errorMessage || 'An unexpected error occurred.'}
              </p>
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Reload Page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

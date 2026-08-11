import { lazy, ComponentType } from 'react';

/**
 * Enhanced lazy loader that handles dynamic import failures caused by production deployments
 * or temporary network glitches.
 * 
 * When a deployment replaces old asset hashes, dynamic import() fails.
 * This utility reloads the window ONCE to fetch the new index.html with updated asset chunks.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  componentName: string = 'component'
) {
  return lazy(async () => {
    const retryKey = `lazy_retry_${componentName}`;
    const pageHasAlreadyBeenReloaded = sessionStorage.getItem(retryKey);

    try {
      const component = await componentImport();
      // Clear flag on successful load
      sessionStorage.removeItem(retryKey);
      return component;
    } catch (error: any) {
      console.error(`[lazyWithRetry] Failed to load dynamic chunk for ${componentName}:`, error);

      // Auto-reload once if not already reloaded in current session
      if (!pageHasAlreadyBeenReloaded) {
        sessionStorage.setItem(retryKey, 'true');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }

      // Rethrow if reloaded already (e.g. offline) so ErrorBoundary can catch it
      throw error;
    }
  });
}

export default lazyWithRetry;

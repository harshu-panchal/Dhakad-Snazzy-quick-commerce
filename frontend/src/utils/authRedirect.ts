/**
 * Where to send a customer after logging in: the page that bounced them to
 * /login (ProtectedRoute and the shared-reel page pass `state.from`), else
 * home. Only same-app paths are accepted, so this can't become an open
 * redirect.
 */
export function getPostLoginRedirect(state: unknown): string {
    const from = (state as { from?: { pathname?: string; search?: string; hash?: string } } | null)
        ?.from;
    const path = from?.pathname;
    if (
        typeof path === 'string' &&
        path.startsWith('/') &&
        !path.startsWith('//') &&
        path !== '/login'
    ) {
        return `${path}${from?.search || ''}${from?.hash || ''}`;
    }
    return '/';
}

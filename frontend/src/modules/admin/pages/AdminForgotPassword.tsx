import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../../services/api/auth/adminAuthService';
import { getApiErrorMessage } from '../../../utils/apiError';

/**
 * Request a password reset link.
 *
 * The server replies identically whether or not the email belongs to an
 * account, so this page shows the same confirmation either way — it must not
 * become a way to discover which addresses are admins.
 */
export default function AdminForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err: unknown) {
      // Rate limiting is the main reason this fails.
      setError(
        getApiErrorMessage(err, 'Could not send the reset link. Please try again shortly.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-green-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-7">
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-green-600"
                aria-hidden="true">
                <path d="M4 4h16v16H4z" />
                <path d="M22 6l-10 7L2 6" />
              </svg>
            </div>
            <h1 className="mb-2 text-lg font-semibold text-neutral-800">
              Check your email
            </h1>
            <p className="mb-6 text-sm text-neutral-600">
              If <span className="font-medium">{email.trim()}</span> belongs to
              an admin account, a password reset link is on its way. The link
              can be used once and expires shortly.
            </p>
            <Link
              to="/admin/login"
              className="inline-block rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-lg font-semibold text-neutral-800">
              Reset your password
            </h1>
            <p className="mb-6 text-sm text-neutral-600">
              Enter the email address on your admin account and we&apos;ll send
              you a reset link.
            </p>

            {error ? (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="mb-2 block text-sm font-medium text-neutral-700">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dhakadsnazzy.com"
                  disabled={loading}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm placeholder:text-neutral-400 transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                />
              </div>

              <button
                type="submit"
                disabled={!email.trim() || loading}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                  email.trim() && !loading
                    ? 'bg-teal-600 text-white shadow-md hover:bg-teal-700'
                    : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
                }`}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-neutral-500">
              Super Admin accounts sign in with mobile OTP and have no password
              to reset.
            </p>

            <div className="mt-4 border-t border-neutral-100 pt-4 text-center">
              <Link
                to="/admin/login"
                className="text-xs font-medium text-teal-700 hover:underline">
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

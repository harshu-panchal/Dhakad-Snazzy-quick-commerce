import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../../services/api/auth/adminAuthService';
import { getApiErrorMessage } from '../../../utils/apiError';

/**
 * Complete a password reset using the emailed token.
 *
 * The policy hints mirror backend/src/models/Admin.ts (validatePasswordStrength)
 * so the user is not told the rules only after a failed submit.
 */

const RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'One number', test: (v: string) => /[0-9]/.test(v) },
];

export default function AdminResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const checks = useMemo(
    () => RULES.map((rule) => ({ ...rule, ok: rule.test(password) })),
    [password],
  );

  const policyOk = checks.every((c) => c.ok);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = policyOk && matches && !loading && Boolean(token);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      await resetPassword(token, password);
      setDone(true);
      // Every session was revoked server-side, so the only next step is a
      // fresh sign-in.
      setTimeout(() => navigate('/admin/login', { replace: true }), 2500);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, 'Could not reset your password. The link may have expired.'),
      );
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-green-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-xl">
          <h1 className="mb-2 text-lg font-semibold text-neutral-800">
            This link is incomplete
          </h1>
          <p className="mb-6 text-sm text-neutral-600">
            The reset link is missing its token. Request a new one.
          </p>
          <Link
            to="/admin/forgot-password"
            className="inline-block rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-green-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">
        {done ? (
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
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className="mb-2 text-lg font-semibold text-neutral-800">
              Password updated
            </h1>
            <p className="mb-6 text-sm text-neutral-600">
              Taking you to the sign-in page...
            </p>
            <Link
              to="/admin/login"
              className="inline-block rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
              Sign in now
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-lg font-semibold text-neutral-800">
              Choose a new password
            </h1>
            <p className="mb-6 text-sm text-neutral-600">
              You&apos;ll be signed out everywhere once this is saved.
            </p>

            {error ? (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-2 block text-sm font-medium text-neutral-700">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 pr-20 text-sm transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-teal-700 hover:underline">
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <ul className="space-y-1.5">
                {checks.map((check) => (
                  <li
                    key={check.label}
                    className={`flex items-center gap-2 text-xs ${
                      check.ok ? 'text-green-700' : 'text-neutral-500'
                    }`}>
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                        check.ok
                          ? 'bg-green-100 text-green-700'
                          : 'bg-neutral-100 text-neutral-400'
                      }`}>
                      {check.ok ? '✓' : '•'}
                    </span>
                    {check.label}
                  </li>
                ))}
              </ul>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-2 block text-sm font-medium text-neutral-700">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm transition-all focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                />
                {confirm.length > 0 && !matches ? (
                  <p className="mt-1.5 text-xs text-red-600">
                    Passwords do not match.
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                  canSubmit
                    ? 'bg-teal-600 text-white shadow-md hover:bg-teal-700'
                    : 'cursor-not-allowed bg-neutral-300 text-neutral-500'
                }`}>
                {loading ? 'Saving...' : 'Save new password'}
              </button>
            </form>

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

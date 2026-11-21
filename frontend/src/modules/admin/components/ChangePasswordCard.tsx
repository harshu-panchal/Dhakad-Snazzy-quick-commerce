import { useMemo, useState } from "react";
import { changePassword } from "../../../services/api/admin/adminProfileService";
import { useAuth } from "../../../context/AuthContext";
import { getApiErrorMessage } from '../../../utils/apiError';

/**
 * Change your own password.
 *
 * The server bumps tokenVersion and revokes every refresh session, so this
 * necessarily ends the current session too — the user is signed out and sent
 * back to the login page.
 *
 * Rules mirror backend/src/models/Admin.ts (validatePasswordStrength).
 */

const RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "One number", test: (v: string) => /[0-9]/.test(v) },
];

interface ChangePasswordCardProps {
  /**
   * Super Admin signs in with mobile OTP and has no password, so the card
   * explains that instead of offering a form.
   */
  isOtpOnly?: boolean;
}

export default function ChangePasswordCard({ isOtpOnly = false }: ChangePasswordCardProps) {
  const { logout } = useAuth();

  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const checks = useMemo(
    () => RULES.map((rule) => ({ ...rule, ok: rule.test(newPassword) })),
    [newPassword],
  );

  const policyOk = checks.every((c) => c.ok);
  const matches = newPassword.length > 0 && newPassword === confirm;
  const canSubmit = Boolean(currentPassword) && policyOk && matches && !saving;

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setError("");
    setShow(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError("");

    try {
      await changePassword({ currentPassword, newPassword });
      setDone(true);
      reset();
      // Give the confirmation a moment to register before signing out.
      setTimeout(() => {
        logout();
        window.location.href = "/admin/login";
      }, 1800);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, "Could not change your password. Please try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (isOtpOnly) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <h3 className="mb-1 text-sm font-semibold text-neutral-800">Password</h3>
        <p className="text-sm text-neutral-600">
          Super Admin accounts sign in with a one-time code sent to your mobile
          number, so there is no password to change.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-neutral-800">Password</h3>
          <p className="text-sm text-neutral-600">
            Changing your password signs you out on every device.
          </p>
        </div>
        {!open && !done ? (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">
            Change password
          </button>
        ) : null}
      </div>

      {done ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Password updated. Signing you out...
        </div>
      ) : null}

      {open && !done ? (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="max-w-sm">
            <label
              htmlFor="current-password"
              className="mb-1.5 block text-sm font-medium text-neutral-700">
              Current password
            </label>
            <input
              id="current-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={saving}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div className="max-w-sm">
            <label
              htmlFor="profile-new-password"
              className="mb-1.5 block text-sm font-medium text-neutral-700">
              New password
            </label>
            <div className="relative">
              <input
                id="profile-new-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 pr-20 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-teal-700 hover:underline">
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <ul className="space-y-1.5">
            {checks.map((check) => (
              <li
                key={check.label}
                className={`flex items-center gap-2 text-xs ${
                  check.ok ? "text-green-700" : "text-neutral-500"
                }`}>
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    check.ok
                      ? "bg-green-100 text-green-700"
                      : "bg-neutral-100 text-neutral-400"
                  }`}>
                  {check.ok ? "✓" : "•"}
                </span>
                {check.label}
              </li>
            ))}
          </ul>

          <div className="max-w-sm">
            <label
              htmlFor="profile-confirm-password"
              className="mb-1.5 block text-sm font-medium text-neutral-700">
              Confirm new password
            </label>
            <input
              id="profile-confirm-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={saving}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            {confirm.length > 0 && !matches ? (
              <p className="mt-1.5 text-xs text-red-600">Passwords do not match.</p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60">
              {saving ? "Saving..." : "Update password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={saving}
              className="rounded-lg border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

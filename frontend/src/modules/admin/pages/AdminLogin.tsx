import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, sendOTP, verifyOTP } from '../../../services/api/auth/adminAuthService';
import OTPInput from '../../../components/OTPInput';
import { useAuth } from '../../../context/AuthContext';
import { getApiErrorMessage, getApiErrorCode } from '../../../utils/apiError';

/**
 * Admin sign-in.
 *
 * Email + password is the primary path and works for every role except Super
 * Admin, which signs in with mobile OTP. The server enforces that split and
 * returns a code telling us which path the account belongs to, so a user who
 * picks the wrong one gets a precise message instead of "invalid credentials".
 */

type Mode = 'password' | 'otp';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login: setSession } = useAuth();

  const [mode, setMode] = useState<Mode>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // password form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP form
  const [mobileNumber, setMobileNumber] = useState('');
  const [showOTP, setShowOTP] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setShowOTP(false);
  };

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError('');

    try {
      const response = await login(email.trim(), password);
      if (response.success && response.data) {
        setSession(
          response.data.token,
          { ...response.data.user, userType: 'Admin' },
          response.data.permissions,
          response.data.cityScope,
        );
        navigate('/admin');
      }
    } catch (err: unknown) {
      const code = getApiErrorCode(err);

      if (code === 'OTP_LOGIN_REQUIRED') {
        // Super Admin account: move them to the right form rather than just
        // reporting a failure.
        setMode('otp');
        setError('Super Admin accounts sign in with mobile OTP.');
      } else {
        setError(
          getApiErrorMessage(err, 'Could not sign in. Please try again.'),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (mobileNumber.length !== 10) return;

    setLoading(true);
    setError('');

    try {
      await sendOTP(mobileNumber);
      setShowOTP(true);
    } catch (err: unknown) {
      const code = getApiErrorCode(err);

      if (code === 'PASSWORD_LOGIN_REQUIRED') {
        setMode('password');
        setError('This account signs in with its email and password.');
      } else {
        setError(
          getApiErrorMessage(err, 'Failed to send OTP. Please try again.'),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await verifyOTP(mobileNumber, otp);
      if (response.success && response.data) {
        setSession(
          response.data.token,
          { ...response.data.user, userType: 'Admin' },
          response.data.permissions,
          response.data.cityScope,
        );
        navigate('/admin');
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Invalid OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-green-50 flex flex-col items-center justify-center px-4 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-neutral-50 transition-colors"
        aria-label="Back">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <path
            d="M15 18L9 12L15 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header Section */}
        <div
          className="px-6 py-4 text-center border-b border-green-700"
          style={{
            backgroundColor: 'rgb(21 178 74 / var(--tw-bg-opacity, 1))',
          }}>
          <div className="mb-0 -mt-4">
            <img
              src="/assets/dhakadsnazzy1.png"
              alt="Dhakad Snazzy"
              className="h-44 w-full max-w-xs mx-auto object-fill object-bottom"
            />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1 -mt-12">
            {mode === 'password' ? 'Staff Login' : 'Admin Login'}
          </h1>
          <p className="text-green-50 text-sm -mt-2">
            {mode === 'password' ? 'Sign in with your staff account' : 'Access your admin dashboard'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          {mode === 'password' ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-email"
                  className="block text-sm font-medium text-neutral-700 mb-2">
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dhakadsnazzy.com"
                  disabled={loading}
                  className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg placeholder:text-neutral-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 transition-all"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-sm font-medium text-neutral-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={loading}
                    className="w-full px-3 py-2.5 pr-20 text-sm border border-neutral-300 rounded-lg placeholder:text-neutral-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-teal-700 hover:underline">
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  to="/admin/forgot-password"
                  className="text-xs font-medium text-teal-700 hover:underline">
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={!email.trim() || !password || loading}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  email.trim() && password && !loading
                    ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-md'
                    : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                }`}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>

              <div className="pt-2 text-center border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => switchMode('otp')}
                  className="mt-3 text-xs font-medium text-neutral-500 hover:text-teal-700">
                  Super Admin? Sign in with mobile OTP
                </button>
              </div>
            </form>
          ) : !showOTP ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="admin-mobile"
                  className="block text-sm font-medium text-neutral-700 mb-2">
                  Mobile Number
                </label>
                <div className="flex items-center bg-white border border-neutral-300 rounded-lg overflow-hidden focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-200 transition-all">
                  <div className="px-3 py-2.5 text-sm font-medium text-neutral-600 border-r border-neutral-300 bg-neutral-50">
                    +91
                  </div>
                  <input
                    id="admin-mobile"
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) =>
                      setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))
                    }
                    placeholder="Enter mobile number"
                    className="flex-1 px-3 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none"
                    maxLength={10}
                    disabled={loading}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Mobile OTP is for Super Admin accounts only.
                </p>
              </div>

              <button
                onClick={handleSendOTP}
                disabled={mobileNumber.length !== 10 || loading}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  mobileNumber.length === 10 && !loading
                    ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-md'
                    : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                }`}>
                {loading ? 'Sending...' : 'Continue'}
              </button>

              <div className="pt-2 text-center border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => switchMode('password')}
                  className="mt-3 text-xs font-medium text-neutral-500 hover:text-teal-700">
                  Sign in as staff
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-neutral-600 mb-2">
                  Enter the OTP sent to
                </p>
                <p className="text-sm font-semibold text-neutral-800">
                  +91 {mobileNumber}
                </p>
              </div>

              <OTPInput onComplete={handleOTPComplete} disabled={loading} />

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowOTP(false);
                    setError('');
                  }}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors border border-neutral-300">
                  Change Number
                </button>
                <button
                  onClick={handleSendOTP}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                  {loading ? 'Verifying...' : 'Resend OTP'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Text */}
      <p className="mt-6 text-xs text-neutral-500 text-center max-w-md">
        By continuing, you agree to Dhakad Snazzy&apos;s Terms of Service and Privacy Policy
      </p>
    </div>
  );
}

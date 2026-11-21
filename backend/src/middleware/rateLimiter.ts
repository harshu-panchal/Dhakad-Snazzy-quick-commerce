import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

/**
 * Rate limiting is enabled in every environment, including development.
 *
 * The limits themselves are env-overridable rather than being switched off by
 * environment — the previous version of this file exported no-op stubs with
 * the real limiters commented out, which meant production had no rate limiting
 * at all. Raise the numbers locally if they get in the way; do not bypass.
 *
 * NOTE: behind a reverse proxy, `app.set("trust proxy", 1)` must be set in
 * server.ts or every request keys to the proxy's own IP and these limiters
 * become global instead of per-client.
 */

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

/** Shared options: skip CORS preflight, emit standard headers, JSON errors. */
const base = (message: string): Partial<Options> => ({
  standardHeaders: true,
  legacyHeaders: false,
  // OPTIONS is a CORS preflight and must never count against a limit.
  skip: (req: Request) => req.method === 'OPTIONS',
  message: { success: false, message },
});

/** Normalised IP key with correct IPv6 handling. */
const ipKey = (req: Request): string => ipKeyGenerator(req.ip || 'unknown');

const emailKey = (req: Request): string => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  return `${ipKey(req)}|${email}`;
};

/**
 * OTP requests. Keyed on the mobile number so one client cannot exhaust
 * another's allowance, falling back to IP when no mobile is supplied.
 */
export const otpRateLimiter = rateLimit({
  ...base('Too many OTP requests. Please try again in a few minutes.'),
  windowMs: num('RATE_LIMIT_OTP_WINDOW_MS', FIFTEEN_MINUTES),
  limit: num('RATE_LIMIT_OTP_MAX', 5),
  keyGenerator: (req: Request) =>
    typeof req.body?.mobile === 'string' && req.body.mobile ? req.body.mobile : ipKey(req),
});

/**
 * Admin password / OTP login attempts. Keyed on IP + email so a shared office
 * IP does not lock out every admin behind it at once.
 */
export const adminLoginRateLimiter = rateLimit({
  ...base('Too many login attempts. Please try again in a few minutes.'),
  windowMs: num('RATE_LIMIT_LOGIN_WINDOW_MS', FIFTEEN_MINUTES),
  limit: num('RATE_LIMIT_LOGIN_MAX', 10),
  keyGenerator: emailKey,
});

export const forgotPasswordRateLimiter = rateLimit({
  ...base('Too many password reset requests. Please try again later.'),
  windowMs: num('RATE_LIMIT_FORGOT_WINDOW_MS', ONE_HOUR),
  limit: num('RATE_LIMIT_FORGOT_MAX', 5),
  keyGenerator: emailKey,
});

export const resetPasswordRateLimiter = rateLimit({
  ...base('Too many password reset attempts. Please try again later.'),
  windowMs: num('RATE_LIMIT_RESET_WINDOW_MS', ONE_HOUR),
  limit: num('RATE_LIMIT_RESET_MAX', 10),
  keyGenerator: ipKey,
});

/**
 * Generic login limiter kept for the seller / customer / delivery auth routes
 * that already import it.
 */
export const loginRateLimiter = rateLimit({
  ...base('Too many login attempts. Please try again in a few minutes.'),
  windowMs: num('RATE_LIMIT_LOGIN_WINDOW_MS', FIFTEEN_MINUTES),
  limit: num('RATE_LIMIT_LOGIN_MAX', 10),
  keyGenerator: ipKey,
});

export const productReminderRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId || 'unauthenticated',
  message: { success: false, message: 'Too many reminder campaign requests. Please try again later.' },
});

/**
 * Explicit no-op, for the rare route that must not be limited. Exported so an
 * opt-out is visible at the call site rather than hidden in this file.
 */
export const noRateLimit = (_req: Request, _res: Response, next: NextFunction) => next();

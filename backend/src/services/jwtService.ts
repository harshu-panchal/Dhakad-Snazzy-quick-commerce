import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserType } from '../models/Otp';

export interface TokenPayload {
  userId: string;
  userType: UserType;
  role?: string;
  /**
   * Admin tokens only. Compared against Admin.tokenVersion on every request so
   * a password change or an explicit "log out everywhere" invalidates tokens
   * that were already issued.
   */
  tokenVersion?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Admin access tokens are short-lived; the httpOnly refresh cookie is what
 * keeps a session alive (see adminAuthController).
 */
export const ADMIN_ACCESS_TOKEN_EXPIRES_IN =
  process.env.ADMIN_ACCESS_TOKEN_EXPIRES_IN || '15m';

export const ADMIN_REFRESH_TOKEN_TTL_DAYS = Number(
  process.env.ADMIN_REFRESH_TOKEN_TTL_DAYS || 7,
);

export interface GenerateTokenOptions {
  tokenVersion?: number;
  expiresIn?: string;
}

/**
 * Generate JWT token for authenticated user
 */
export function generateToken(
  userId: string,
  userType: UserType,
  role?: string,
  options: GenerateTokenOptions = {},
): string {
  const payload: TokenPayload = {
    userId,
    userType,
    ...(role && { role }),
    ...(options.tokenVersion !== undefined && { tokenVersion: options.tokenVersion }),
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: options.expiresIn || JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Short-lived admin access token carrying the account's tokenVersion.
 */
export function generateAdminAccessToken(
  userId: string,
  role: string,
  tokenVersion: number,
): string {
  return generateToken(userId, 'Admin', role, {
    tokenVersion,
    expiresIn: ADMIN_ACCESS_TOKEN_EXPIRES_IN,
  });
}

/**
 * Opaque refresh token. Only its sha256 hash is stored (AdminSession); the
 * token itself lives solely in the client's httpOnly cookie.
 */
export function generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(
      Date.now() + ADMIN_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    ),
  };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

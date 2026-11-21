import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../services/jwtService';
import { resolveAdminContext, AdminContext } from '../services/adminPermissionService';

export type AuthUserType = 'Admin' | 'Seller' | 'Customer' | 'Delivery';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      /**
       * Resolved role and permissions. Populated by `authenticate` for Admin
       * tokens only. Read by requirePages / requireSuperAdmin and the audit
       * log middleware.
       */
      adminContext?: AdminContext;
    }
  }
}

/**
 * Authenticate user by verifying JWT token.
 *
 * For Admin tokens this additionally resolves the account's current role and
 * permissions from the database, so a role edit or a deactivation applies on
 * the very next request instead of waiting for the token to expire.
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'No token provided. Authorization header must be in format: Bearer <token>',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    let decoded: TokenPayload;
    try {
      decoded = verifyToken(token);
    } catch (error: any) {
      res.status(401).json({
        success: false,
        message: error.message || 'Invalid or expired token',
      });
      return;
    }

    req.user = decoded;

    if (decoded.userType === 'Admin') {
      const ctx = await resolveAdminContext(decoded.userId);

      if (!ctx) {
        res.status(401).json({
          success: false,
          code: 'ACCOUNT_NOT_FOUND',
          message: 'This admin account no longer exists.',
        });
        return;
      }

      if (!ctx.isActive) {
        res.status(401).json({
          success: false,
          code: 'ACCOUNT_DISABLED',
          message: 'This admin account has been deactivated.',
        });
        return;
      }

      // Forced logout: a bumped tokenVersion invalidates every token issued
      // before it (password change, reset, or an explicit "log out everywhere").
      if ((decoded.tokenVersion ?? 0) !== ctx.tokenVersion) {
        res.status(401).json({
          success: false,
          code: 'SESSION_REVOKED',
          message: 'Your session has ended. Please sign in again.',
        });
        return;
      }

      req.adminContext = ctx;
      // Keep req.user.role in step with the database so anything still reading
      // it sees the current role rather than the one baked into the token.
      req.user.role = ctx.roleName;
    }

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message,
    });
    return;
  }
};

/**
 * Authorize user by checking role name.
 *
 * Note: for admin page access use `requirePages` from middleware/permissions
 * instead. This remains for coarse role-name checks.
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Required role: ' + roles.join(' or '),
      });
      return;
    }

    next();
  };
};

/**
 * Require specific user type(s)
 */
export const requireUserType = (...userTypes: AuthUserType[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    if (!userTypes.includes(req.user.userType)) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Required user type: ' + userTypes.join(' or '),
      });
      return;
    }

    next();
  };
};

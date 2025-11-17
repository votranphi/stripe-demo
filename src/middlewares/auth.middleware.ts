import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { UserRole } from '../models/user.model.js';
import { 
  UnauthorizedException, 
  ForbiddenException,
  InvalidTokenException 
} from '../errors/CustomError.js';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: UserRole;
      };
    }
  }
}

export class AuthMiddleware {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  // Verify JWT token and attach user to request
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException();
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      if (!token) {
        throw new UnauthorizedException();
      }

      // Verify token
      const decoded = this.authService.verifyToken(token);

      // Attach user to request
      req.user = {
        userId: decoded.userId,
        role: decoded.role
      };

      next();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        next(error);
      } else {
        next(new InvalidTokenException());
      }
    }
  };

  // Check if user is admin
  isAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    next();
  };
}
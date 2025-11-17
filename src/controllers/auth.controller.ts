import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import { asyncHandler } from '../middlewares/error.middleware.js';

export class AuthController {
  private authService: AuthService | null = null;

  // For lazy initialization
  private getAuthService(): AuthService {
    if (!this.authService) {
      this.authService = new AuthService();
    }
    return this.authService;
  }

  // POST /api/v1/auth/register
  register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Validate request body using Zod schema
    const validatedData = registerSchema.parse(req.body);

    // Register user
    const result = await this.getAuthService().register(validatedData);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId: result.userId,
        email: result.email,
        role: result.role,
        token: result.token
      }
    });
  });

  // POST /api/v1/auth/login
  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Validate request body using Zod schema
    const validatedData = loginSchema.parse(req.body);

    // Login user
    const result = await this.getAuthService().login(validatedData);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        userId: result.userId,
        email: result.email,
        role: result.role,
        token: result.token
      }
    });
  });
}
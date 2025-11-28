import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { RegisterDTO, LoginDTO } from '../dtos/auth.dto.js';
import { ErrorMiddleware } from '../middlewares/error.middleware.js';

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
  register = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Validate request body using DTO
    const dto = new RegisterDTO(req.body);
    // Register user
    const result = await this.getAuthService().register(dto.email, dto.password, dto.role);

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
  login = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Validate request body using DTO
    const dto = new LoginDTO(req.body);
    // Login user
    const result = await this.getAuthService().login(dto.email, dto.password);

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
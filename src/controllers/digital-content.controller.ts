import { Request, Response } from 'express';
import { ErrorMiddleware } from '../middlewares/error.middleware.js';

export class DigitalContentController {
  
  // GET /api/v1/digital-content
  getContent = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      message: 'Access granted: This is premium content.',
      data: {
        content: 'Here is your exclusive digital content.'
      }
    });
  });
}

import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../errors/CustomError.js';
import { ZodError } from 'zod';

export class ErrorMiddleware {
  public handle = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    console.error('Error caught by middleware:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method
    });

    // Handle custom application errors
    if (error instanceof CustomError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      return;
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid request data',
        errors: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      });
      return;
    }

    // Handle Stripe errors
    if (error.name === 'StripeError' || error.name === 'StripeAPIError') {
      res.status(400).json({
        success: false,
        message: 'Payment processing error',
        error: error.message
      });
      return;
    }

    // Handle MongoDB/Mongoose errors
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
      res.status(500).json({
        success: false,
        message: 'Database error occurred',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
      return;
    }

    // Default to 500 server error
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  };

  // Async handler wrapper to catch errors in async route handlers. Eliminates need for try-catch in every controller method
  public static asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
  ) {
    return (req: Request, res: Response, next: NextFunction): void => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}
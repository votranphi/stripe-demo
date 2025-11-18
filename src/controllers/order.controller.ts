import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service.js';
import { createOrderSchema } from '../validators/order.validator.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import { MissingSessionIdException, UnauthorizedException } from '../errors/CustomError.js';

export class OrderController {
  private orderService: OrderService | null = null;

  // For lazy initialization
  private getOrderService(): OrderService {
    if (!this.orderService) {
      this.orderService = new OrderService();
    }
    return this.orderService;
  }

  // POST /api/v1/orders
  createOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Validate request body using Zod schema
    const { products } = createOrderSchema.parse(req.body);

    // Get userId from req.user (assigned by AuthMiddleware)
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    // Create order with transaction support
    const order = await this.getOrderService().createOrder(products, userId);

    // Create Stripe Checkout Session
    const checkoutUrl = await this.getOrderService().createCheckoutSession(order.id, 'v1');

    res.status(201).json({
      success: true,
      data: {
        order: order,
        checkoutUrl: checkoutUrl
      }
    });
  });

  // GET /api/v1/orders/success?session_id=xxx
  checkoutSuccess = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.query.session_id as string;

    if (!sessionId) {
      throw new MissingSessionIdException();
    }

    // Retrieve session and order info
    const { orderId, session } = await this.getOrderService().retrieveCheckoutSession(sessionId);

    // Get order info (DO NOT update status here - only webhook should do that)
    const order = await this.getOrderService().getOrderById(orderId);

    res.status(200).json({
      success: true,
      message: 'Payment successful! Your order is being processed.',
      data: {
        orderId: orderId,
        paymentStatus: session.payment_status,
        order: order
      }
    });
  });

  // GET /api/v1/orders/cancel
  checkoutCancel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      message: 'Payment was canceled. You can retry the checkout anytime.',
      data: {
        redirectUrl: '/products'
      }
    });
  });
}
import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service.js';
import { addItemSchema, updateItemSchema } from '../validators/order.validator.js';
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

  // GET /api/v1/orders/draft
  getDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const draft = await this.getOrderService().getUserDraft(userId);

    res.status(200).json({
      success: true,
      data: draft
    });
  });

  // POST /api/v1/orders/draft/items
  addItemToDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    // Validate request body
    const { productId, quantity } = addItemSchema.parse(req.body);

    const updatedDraft = await this.getOrderService().addItemToDraft(userId, productId, quantity);

    res.status(200).json({
      success: true,
      message: 'Item added to cart',
      data: updatedDraft
    });
  });

  // DELETE /api/v1/orders/draft/items/:productId
  removeItemFromDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const { productId } = req.params;
    if (!productId) {
      throw new Error('Product ID is required');
    }

    const updatedDraft = await this.getOrderService().removeItemFromDraft(userId, productId);

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: updatedDraft
    });
  });

  // PATCH /api/v1/orders/draft/items/:productId
  updateItemQuantity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const { productId } = req.params;
    if (!productId) {
      throw new Error('Product ID is required');
    }

    const { quantity } = updateItemSchema.parse(req.body);

    const updatedDraft = await this.getOrderService().updateDraftItemQuantity(userId, productId, quantity);

    res.status(200).json({
      success: true,
      message: 'Cart item updated',
      data: updatedDraft
    });
  });

  // POST /api/v1/orders/checkout
  createCheckoutSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    // Create checkout from user's draft
    const { checkoutUrl, orderId } = await this.getOrderService().createCheckoutFromDraft(userId, 'v1');

    res.status(201).json({
      success: true,
      data: {
        orderId: orderId,
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
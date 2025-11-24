import { Request, Response } from 'express';
import { OrderService } from '../services/order.service.js';
import { AddItemDTO, UpdateItemDTO, UpdateOrderStatusDTO } from '../dtos/order.dto.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import { MissingSessionIdException, UnauthorizedException } from '../errors/CustomError.js';
import { OrderStatus } from '../models/order.model.js';

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

    // Validate request body using DTO
    const dto = new AddItemDTO(req.body);
    const updatedDraft = await this.getOrderService().addItemToDraft(userId, dto.productId, dto.quantity);

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

    const dto = new UpdateItemDTO(req.body);
    const updatedDraft = await this.getOrderService().updateDraftItemQuantity(userId, productId, dto.quantity);

    res.status(200).json({
      success: true,
      message: 'Cart item updated',
      data: updatedDraft
    });
  });

  // GET /api/v1/admin/orders
  getAllOrdersByAdmin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // isAdmin middleware should already protect this route
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await this.getOrderService().getAllOrders(page, limit);
    res.status(200).json({
      success: true,
      data: result.orders,
      pagination: {
        page: result.page,
        limit: limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  });

  // PUT /api/v1/admin/orders/:id/status
  updateOrderStatusByAdmin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // isAdmin middleware should already protect this route
    const { id } = req.params;
    if (!id) {
      throw new Error('Order ID is required');
    }

    // Validate and parse body using DTO
    const dto = new UpdateOrderStatusDTO(req.body);

    const updatedOrder = await this.getOrderService().updateOrderStatus(id, dto.status as OrderStatus);
    if (!updatedOrder) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    res.status(200).json({
      success: true,
      message: 'Order status updated',
      data: updatedOrder
    });
  });

  // POST /api/v1/orders/checkout/create-session
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

  // GET /api/v1/orders/checkout/success?session_id=xxx
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

  // GET /api/v1/orders/checkout/cancel
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
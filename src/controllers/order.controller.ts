import { Request, Response } from 'express';
import { OrderService } from '../services/order.service.js';
import { OrderProduct, OrderStatus } from '../models/order.model.js';

export class OrderController {
  private orderService: OrderService | null = null;

  private getOrderService(): OrderService {
    if (!this.orderService) {
      this.orderService = new OrderService();
    }
    return this.orderService;
  }

  // POST /api/v1/orders
  createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { products }: { products: OrderProduct[] } = req.body;

      // Validate input
      if (!products || !Array.isArray(products) || products.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Products array is required and must not be empty'
        });
        return;
      }

      // Validate each product item
      for (const item of products) {
        if (!item.id || typeof item.quantity !== 'number' || item.quantity <= 0) {
          res.status(400).json({
            success: false,
            message: 'Each product must have valid id and quantity > 0'
          });
          return;
        }
      }

      // Create order with PENDING status
      const order = await this.getOrderService().createOrder(products);

      // Create Stripe Checkout Session
      const checkoutUrl = await this.getOrderService().createCheckoutSession(order.id);

      res.status(201).json({
        success: true,
        data: {
          order: order,
          checkoutUrl: checkoutUrl
        }
      });
    } catch (error) {
      console.error('Error in createOrder:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create order',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // GET /api/v1/orders/success?session_id=xxx
  checkoutSuccess = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.query.session_id as string;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: 'Missing session_id in query parameters'
        });
        return;
      }

      // Retrieve session and order info
      const { orderId, session } = await this.getOrderService().retrieveCheckoutSession(sessionId);

      // Update order status to PAID if payment is successful
      let order = await this.getOrderService().getOrderById(orderId);
      if (session.payment_status === 'paid' && order && order.status !== OrderStatus.PAID) {
        order = await this.getOrderService().updateOrderStatus(orderId, OrderStatus.PAID);
      }

      res.status(200).json({
        success: true,
        message: 'Payment successful! Your order is being processed.',
        data: {
          orderId: orderId,
          paymentStatus: session.payment_status,
          order: order
        }
      });
    } catch (error) {
      console.error('Error in checkoutSuccess:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve checkout session',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // GET /api/v1/orders/cancel
  checkoutCancel = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      message: 'Payment was canceled. You can retry the checkout anytime.',
      data: {
        redirectUrl: '/products' // Frontend can use this to redirect user
      }
    });
  };
}
import { Request, Response } from 'express';
import { OrderService } from '../services/order.service.js';
import { OrderProduct, OrderStatus } from '../models/order.model.js';
import { createOrderSchema } from '../validators/order.validator.js';

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
  createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body using Zod schema
      const parseResult = createOrderSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: 'Invalid order data',
          errors: parseResult.error.issues
        });
        return;
      }
      const { products } = parseResult.data;
      // Create order with PENDING status
      const order = await this.getOrderService().createOrder(products);
      // Create Stripe Checkout Session
      const checkoutUrl = await this.getOrderService().createCheckoutSession(order.id, 'v1');
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

  // POST /api/v2/orders
  createOrderV2 = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body using Zod schema
      const parseResult = createOrderSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: 'Invalid order data',
          errors: parseResult.error.issues
        });
        return;
      }
      const { products } = parseResult.data;
      // Create order with transaction support
      const order = await this.getOrderService().createOrderV2(products);
      // Create Stripe Checkout Session
      const checkoutUrl = await this.getOrderService().createCheckoutSession(order.id, 'v2');
      res.status(201).json({
        success: true,
        data: {
          order: order,
          checkoutUrl: checkoutUrl
        }
      });
    } catch (error) {
      console.error('Error in createOrderV2:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create order',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // GET /api/v2/orders/success?session_id=xxx
  checkoutSuccessV2 = async (req: Request, res: Response): Promise<void> => {
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
    } catch (error) {
      console.error('Error in checkoutSuccessV2:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve checkout session',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // GET /api/v2/orders/cancel
  checkoutCancelV2 = async (req: Request, res: Response): Promise<void> => {
    await this.checkoutCancel(req, res);
  };
}
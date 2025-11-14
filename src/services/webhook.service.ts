import { OrderService } from './order.service.js';
import { ProductService } from './product.service.js';
import stripe from '../config/stripe.js';
import { OrderStatus } from '../models/order.model.js';
import { WebhookSignatureException, DuplicateProcessingException } from '../errors/CustomError.js';
import Stripe from 'stripe';

export class WebhookService {
  private productService: ProductService;
  private orderService: OrderService;

  constructor() {
    this.productService = new ProductService();
    this.orderService = new OrderService();
  }

  async handleWebhookEvent(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not defined');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw new WebhookSignatureException();
    }

    console.log(`Received webhook event: ${event.type}`);

    // Handle specific events
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      
      // Add more event handlers as needed
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    try {
      const orderId = session.metadata?.order_id;

      if (!orderId) {
        console.error('Order ID not found in session metadata');
        return;
      }

      // Check for idempotency
      if (this.orderService.isSessionProcessed(session.id)) {
        console.log(`Session ${session.id} already processed, skipping...`);
        throw new DuplicateProcessingException(`Session ${session.id} has already been processed`);
      }

      // Verify payment status
      if (session.payment_status !== 'paid') {
        console.log(`Payment not completed for session ${session.id}`);
        return;
      }

      // Get order
      const order = await this.orderService.getOrderById(orderId);
      if (!order) {
        console.error(`Order ${orderId} not found`);
        return;
      }

      // Update order status only if it's still PENDING
      if (order.status === OrderStatus.PENDING) {
        await this.orderService.updateOrderStatusWithRetry(orderId, OrderStatus.PAID);
        console.log(`Order ${orderId} marked as PAID`);
        
        // Mark session as processed
        this.orderService.markSessionAsProcessed(session.id);
      } else {
        console.log(`Order ${orderId} is already in ${order.status} status`);
      }
    } catch (error) {
      console.error('Error handling checkout.session.completed:', error);
      throw error;
    }
  }
}
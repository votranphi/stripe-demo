import { OrderService } from './order.service.js';
import stripe from '../config/stripe.js';
import { OrderStatus } from '../models/order.model.js';
import { WebhookEventModel } from '../models/webhook-event.model.js';
import { WebhookSignatureException, DuplicateProcessingException } from '../errors/CustomError.js';
import Stripe from 'stripe';

export class WebhookService {
  private orderService: OrderService;

  constructor() {
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
    const orderId = session.metadata?.order_id;
    const userId = session.metadata?.user_id;

    if (!orderId) {
      console.error('Order ID not found in session metadata');
      await this.logWebhookEvent(session.id, 'checkout.session.completed', undefined, 'failed', 'Order ID not found in session metadata');
      return;
    }

    if (!userId) {
      console.error('User ID not found in session metadata');
      await this.logWebhookEvent(session.id, 'checkout.session.completed', orderId, 'failed', 'User ID not found in session metadata');
      return;
    }

    try {
      // Check for idempotency using database
      const existingEvent = await WebhookEventModel.findOne({ sessionId: session.id });
      
      if (existingEvent) {
        console.log(`Session ${session.id} already processed at ${existingEvent.processedAt}, skipping...`);
        throw new DuplicateProcessingException(`Session ${session.id} has already been processed`);
      }

      // Verify payment status
      if (session.payment_status !== 'paid') {
        console.log(`Payment not completed for session ${session.id}`);
        await this.logWebhookEvent(session.id, 'checkout.session.completed', orderId, 'failed', 'Payment not completed');
        return;
      }

      // Get order
      const order = await this.orderService.getOrderById(orderId);
      if (!order) {
        console.error(`Order ${orderId} not found`);
        await this.logWebhookEvent(session.id, 'checkout.session.completed', orderId, 'failed', 'Order not found');
        return;
      }

      // Update order status only if it's still PENDING
      if (order.status === OrderStatus.PENDING) {
        await this.orderService.updateOrderStatusWithRetry(orderId, OrderStatus.PAID);
        console.log(`Order ${orderId} marked as PAID`);
        
        // Create a fresh DRAFT order for the user (new shopping cart)
        await this.orderService.createNewDraft(userId);
        console.log(`New draft order created for user ${userId}`);
        
        // Mark session as processed in database
        await this.logWebhookEvent(session.id, 'checkout.session.completed', orderId, 'success');
      } else {
        console.log(`Order ${orderId} is already in ${order.status} status`);
        await this.logWebhookEvent(session.id, 'checkout.session.completed', orderId, 'success', `Order already in ${order.status} status`);
      }
    } catch (error) {
      console.error('Error handling checkout.session.completed:', error);
      await this.logWebhookEvent(
        session.id, 
        'checkout.session.completed', 
        orderId, 
        'failed', 
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  private async logWebhookEvent(
    sessionId: string,
    eventType: string,
    orderId: string | undefined,
    status: 'success' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      const webhookEvent = new WebhookEventModel({
        sessionId,
        eventType,
        orderId,
        processedAt: new Date(),
        status,
        errorMessage
      });

      await webhookEvent.save();
    } catch (error) {
      console.error('Failed to log webhook event:', error);
      // Don't throw error here to avoid blocking the webhook processing
    }
  }
}
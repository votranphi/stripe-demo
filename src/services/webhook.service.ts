import { OrderService } from './order.service.js';
import stripe from '../config/stripe.js';
import { OrderStatus } from '../models/order.model.js';
import { WebhookEventModel } from '../models/webhook-event.model.js';
import { WebhookSignatureException, DuplicateProcessingException } from '../errors/CustomError.js';
import Stripe from 'stripe';
import Database from '../config/database.js';

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
    // Use Stripe metadata to retrieve Order ID
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

    // Verify payment status before starting transaction
    if (session.payment_status !== 'paid') {
      console.log(`Payment not completed for session ${session.id}`);
      await this.logWebhookEvent(session.id, 'checkout.session.completed', orderId, 'failed', 'Payment not completed');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ sessionId: session.id }).session(dbSession);
        
        if (existingEvent) {
          console.log(`Session ${session.id} already processed at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Session ${session.id} has already been processed`);
        }

        // Get order within transaction
        const order = await this.orderService.getOrderById(orderId);
        if (!order) {
          console.error(`Order ${orderId} not found`);
          throw new Error('Order not found');
        }

        // Only process if order is still PENDING
        if (order.status !== OrderStatus.PENDING) {
          console.log(`Order ${orderId} is already in ${order.status} status, skipping...`);
          // Still log as success since this is not an error condition
          await this.logWebhookEvent(session.id, 'checkout.session.completed', orderId, 'success', `Order already in ${order.status} status`);
          return;
        }

        // Save payment_intent ID to order for future refunds
        if (session.payment_intent && typeof session.payment_intent === 'string') {
          await this.orderService.savePaymentIntentId(orderId, session.payment_intent);
        }

        // Update Order status from PENDING to PAID
        await this.orderService.updateOrderStatusWithRetry(orderId, OrderStatus.PAID);
        console.log(`Order ${orderId} marked as PAID`);

        // Update status to PROCESSING to signal fulfillment start
        await this.orderService.updateOrderStatusWithRetry(orderId, OrderStatus.PROCESSING);
        console.log(`Order ${orderId} marked as PROCESSING`);

        // Create a fresh DRAFT order for the user (new shopping cart)
        await this.orderService.createNewDraft(userId);
        console.log(`New draft order created for user ${userId}`);

        // Mark session as processed in database
        const webhookEvent = new WebhookEventModel({
          sessionId: session.id,
          eventType: 'checkout.session.completed',
          orderId: orderId,
          processedAt: new Date(),
          status: 'success'
        });
        await webhookEvent.save({ session: dbSession });
        console.log(`Webhook event logged for session ${session.id}`);
      });
    } catch (error) {
      console.error('Error handling checkout.session.completed:', error);
      
      // Log webhook event failure outside transaction
      await this.logWebhookEvent(
        session.id, 
        'checkout.session.completed', 
        orderId, 
        'failed', 
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      throw error;
    } finally {
      await dbSession.endSession();
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
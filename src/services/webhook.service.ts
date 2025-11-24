import { OrderService } from './order.service.js';
import stripe from '../config/stripe.js';
import { OrderModel, OrderStatus } from '../models/order.model.js';
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

    // Save webhook event IMMEDIATELY after verification, before processing
    await this.saveWebhookEvent(event);

    // Handle specific events
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      
      case 'checkout.session.expired':
        await this.handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
        break;
      
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
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

  private async saveWebhookEvent(event: Stripe.Event): Promise<void> {
    try {
      const sessionId = (event.data.object as any).id || event.id;
      const orderId = (event.data.object as any).metadata?.order_id;

      const webhookEvent = new WebhookEventModel({
        sessionId,
        eventType: event.type,
        orderId,
        processedAt: new Date(),
        status: 'pending',
        errorMessage: undefined
      });

      await webhookEvent.save();
      console.log(`Webhook event ${event.type} saved for session ${sessionId}`);
    } catch (error) {
      console.error('Failed to save webhook event:', error);
      // Don't throw to avoid blocking webhook processing
    }
  }

  private async handleCheckoutSessionExpired(session: Stripe.Checkout.Session): Promise<void> {
    const orderId = session.metadata?.order_id;

    if (!orderId) {
      console.error('Order ID not found in expired session metadata');
      return;
    }

    try {
      const order = await this.orderService.getOrderById(orderId);
      
      if (!order) {
        console.error(`Order ${orderId} not found`);
        return;
      }

      // Only update if order is still pending
      if (order.status === OrderStatus.PENDING) {
        await this.orderService.updateOrderStatus(orderId, OrderStatus.CANCELLED);
        console.log(`Order ${orderId} marked as CANCELLED due to session expiration`);
        
        // Update webhook event status
        await WebhookEventModel.findOneAndUpdate(
          { sessionId: session.id, eventType: 'checkout.session.expired' },
          { status: 'success' }
        );
      }
    } catch (error) {
      console.error('Error handling checkout.session.expired:', error);
      
      // Update webhook event status to failed
      await WebhookEventModel.findOneAndUpdate(
        { sessionId: session.id, eventType: 'checkout.session.expired' },
        { 
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      // Find order by payment intent ID
      const order = await OrderModel.findOne({ stripePaymentIntentId: paymentIntent.id });

      if (!order) {
        console.log(`No order found for payment intent ${paymentIntent.id}`);
        return;
      }

      // Only update if order is still pending
      if (order.status === OrderStatus.PENDING) {
        await this.orderService.updateOrderStatus(order.id, OrderStatus.CANCELLED);
        console.log(`Order ${order.id} marked as CANCELLED due to payment failure`);
        
        // Update webhook event status
        await WebhookEventModel.findOneAndUpdate(
          { sessionId: paymentIntent.id, eventType: 'payment_intent.payment_failed' },
          { status: 'success', orderId: order.id }
        );
      }
    } catch (error) {
      console.error('Error handling payment_intent.payment_failed:', error);
      
      // Update webhook event status to failed
      await WebhookEventModel.findOneAndUpdate(
        { sessionId: paymentIntent.id, eventType: 'payment_intent.payment_failed' },
        { 
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }
  }
}
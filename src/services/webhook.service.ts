import { OrderService } from './order.service.js';
import { PaymentService } from './payment.service.js';
import { OrderStatus } from '../models/order.model.js';
import { WebhookEventModel } from '../models/webhook-event.model.js';
import { WebhookSignatureException, DuplicateProcessingException } from '../errors/CustomError.js';
import { UserSubscriptionModel, UserSubscriptionStatus } from '../models/user-subscription.model.js';
import { UserModel } from '../models/user.model.js';
import Stripe from 'stripe';
import Database from '../config/database.js';
import crypto from 'crypto';

export class WebhookService {
  private readonly orderService: OrderService;
  private readonly paymentService: PaymentService;

  constructor(
    orderService?: OrderService,
    paymentService?: PaymentService
  ) {
    this.orderService = orderService || new OrderService();
    this.paymentService = paymentService || new PaymentService();
  }

  async handleWebhookEvent(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not defined');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature using PaymentService
      event = this.paymentService.verifyWebhookSignature(payload, signature, webhookSecret);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw new WebhookSignatureException();
    }

    console.log(`Received webhook event: ${event.type}`);

    // Handle specific events
    switch (event.type) {
      case 'checkout.session.completed':
        // Save only handled event to DB
        await this.saveWebhookEvent(event);
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'checkout.session.expired':
        await this.saveWebhookEvent(event);
        await this.handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
        break;

      case 'charge.refunded':
        await this.saveWebhookEvent(event);
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case 'customer.subscription.created':
        await this.saveWebhookEvent(event);
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.saveWebhookEvent(event);
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await this.saveWebhookEvent(event);
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.saveWebhookEvent(event);
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      // Add more event handlers as needed
      default:
        // Log unhandled event, do NOT save to DB
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    // Use Stripe metadata to retrieve Order ID
    const orderId = session.metadata?.order_id;
    const userId = session.metadata?.user_id;

    if (!orderId && session.mode === 'payment') {
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
        // Check Idempotency - only throw error if event has been successfully proccessed
        const existingEvent = await WebhookEventModel.findOne({ stripeId: session.id }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`Session ${session.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Session ${session.id} has already been processed`);
        }

        // If existingEvent and the status is 'pending' or 'failed', accept retry logic
        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`Session ${session.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Just do processing on Order if it's a payment's checkout.session (checkout.session has orderId in metadata)
        if (orderId) {
          // Get order within transaction
          const order = await this.orderService.getOrderById(orderId);
          if (!order) {
            console.error(`Order ${orderId} not found`);
            throw new Error('Order not found');
          }

          // Only process if order is still PENDING
          if (order.status !== OrderStatus.PENDING) {
            console.log(`Order ${orderId} is already in ${order.status} status, skipping...`);

            // Update webhool event to success because the order has been proccessed
            await WebhookEventModel.findOneAndUpdate(
              { stripeId: session.id },
              {
                status: 'success',
                processedAt: new Date(),
                errorMessage: `Order already in ${order.status} status`
              },
              { session: dbSession }
            );
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
        }

        // Update webhook event to success (rather than create a new one)
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: session.id },
          {
            status: 'success',
            processedAt: new Date(),
            orderId: orderId,
            eventType: 'checkout.session.completed',
            errorMessage: undefined
          },
          {
            upsert: true, // Create a new one if it's never existed (just in case saveWebhookEvent failed)
            session: dbSession
          }
        );
        console.log(`Webhook event updated to success for session ${session.id}`);
      });
    } catch (error) {
      console.error('Error handling checkout.session.completed:', error);

      // Update webhook event to failed (rather than create a new one)
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: session.id },
        {
          status: 'failed',
          processedAt: new Date(),
          orderId: orderId,
          eventType: 'checkout.session.completed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        },
        { upsert: true } // Create a new one if it's never existed
      );

      throw error;
    } finally {
      await dbSession.endSession();
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
          { stripeId: session.id, eventType: 'checkout.session.expired' },
          { status: 'success' }
        );
      }
    } catch (error) {
      console.error('Error handling checkout.session.expired:', error);

      // Update webhook event status to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: session.id, eventType: 'checkout.session.expired' },
        {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    // Extract payment_intent from charge object
    const paymentIntentId = charge.payment_intent as string;

    if (!paymentIntentId) {
      console.error('Payment intent ID not found in charge.refunded event');
      await this.logWebhookEvent(charge.id, 'charge.refunded', undefined, 'failed', 'Payment intent ID not found');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency - only throw error if event has been successfully processed
        const existingEvent = await WebhookEventModel.findOne({ stripeId: charge.id }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`Charge ${charge.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Charge ${charge.id} has already been processed`);
        }

        // If existingEvent and the status is 'pending' or 'failed', accept retry logic
        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`Charge ${charge.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find order by payment intent ID
        const order = await this.orderService.getOrderByPaymentIntentId(paymentIntentId);

        if (!order) {
          console.error(`Order not found for payment intent ${paymentIntentId}`);
          throw new Error('Order not found for payment intent');
        }

        // Only process if order is not already CANCELLED
        if (order.status === OrderStatus.CANCELLED) {
          console.log(`Order ${order.id} is already CANCELLED, skipping...`);

          // Update webhook event to success because the order has been processed
          await WebhookEventModel.findOneAndUpdate(
            { stripeId: charge.id },
            {
              status: 'success',
              processedAt: new Date(),
              orderId: order.id,
              errorMessage: 'Order already CANCELLED'
            },
            { session: dbSession }
          );
          return;
        }

        // Update order status to CANCELLED with skipRefund = true
        // This will restock items but skip calling Stripe refund API
        await this.orderService.updateOrderStatus(order.id, OrderStatus.CANCELLED, true);
        console.log(`Order ${order.id} marked as CANCELLED due to Stripe Dashboard refund (skipRefund=true)`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: charge.id },
          {
            status: 'success',
            processedAt: new Date(),
            orderId: order.id,
            eventType: 'charge.refunded',
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`Webhook event updated to success for charge ${charge.id}`);
      });
    } catch (error) {
      console.error('Error handling charge.refunded:', error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: charge.id },
        {
          status: 'failed',
          processedAt: new Date(),
          eventType: 'charge.refunded',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        },
        { upsert: true }
      );

      throw error;
    } finally {
      await dbSession.endSession();
    }
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    const stripeCustomerId = subscription.customer;

    if (!stripeCustomerId) {
      console.error('Customer ID not found in subscription.created event');
      await this.logWebhookEvent(subscription.id, 'customer.subscription.created', undefined, 'failed', 'Customer ID not found');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: subscription.id }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`Subscription ${subscription.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Subscription ${subscription.id} has already been processed`);
        }

        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`Subscription ${subscription.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find user by Stripe Customer ID
        const user = await UserModel.findOne({ stripeCustomerId }).session(dbSession);

        if (!user) {
          console.error(`User not found for Stripe customer ${stripeCustomerId}`);
          throw new Error('User not found for Stripe customer');
        }

        // Create or update UserSubscription
        const currentPeriodEnd = new Date((subscription as any).items.data[0].current_period_end * 1000);

        await UserSubscriptionModel.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          {
            id: crypto.randomUUID(),
            userId: user.id,
            stripeSubscriptionId: subscription.id,
            status: UserSubscriptionStatus.ACTIVE,
            currentPeriodEnd
          },
          {
            upsert: true,
            session: dbSession,
            setDefaultsOnInsert: true
          }
        );

        console.log(`UserSubscription created/updated for user ${user.id}, subscription ${subscription.id}`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: subscription.id },
          {
            status: 'success',
            processedAt: new Date(),
            eventType: 'customer.subscription.created',
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`Webhook event updated to success for subscription ${subscription.id}`);
      });
    } catch (error) {
      console.error('Error handling customer.subscription.created:', error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: subscription.id },
        {
          status: 'failed',
          processedAt: new Date(),
          eventType: 'customer.subscription.created',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        },
        { upsert: true }
      );

      throw error;
    } finally {
      await dbSession.endSession();
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: subscription.id, eventType: 'customer.subscription.deleted' }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`Subscription deletion ${subscription.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Subscription deletion ${subscription.id} has already been processed`);
        }

        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`Subscription deletion ${subscription.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find and update UserSubscription
        const userSubscription = await UserSubscriptionModel.findOne({ stripeSubscriptionId: subscription.id }).session(dbSession);

        if (!userSubscription) {
          console.error(`UserSubscription not found for subscription ${subscription.id}`);
          throw new Error('UserSubscription not found');
        }

        // Update status to INACTIVE
        userSubscription.status = UserSubscriptionStatus.INACTIVE;
        await userSubscription.save({ session: dbSession });

        console.log(`UserSubscription ${userSubscription.id} marked as INACTIVE`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: subscription.id, eventType: 'customer.subscription.deleted' },
          {
            status: 'success',
            processedAt: new Date(),
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`Webhook event updated to success for subscription deletion ${subscription.id}`);
      });
    } catch (error) {
      console.error('Error handling customer.subscription.deleted:', error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: subscription.id, eventType: 'customer.subscription.deleted' },
        {
          status: 'failed',
          processedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        },
        { upsert: true }
      );

      throw error;
    } finally {
      await dbSession.endSession();
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoice.parent?.subscription_details?.subscription;

    if (!subscriptionId) {
      console.error('Subscription ID not found in invoice.payment_succeeded event');
      await this.logWebhookEvent(invoice.id, 'invoice.payment_succeeded', undefined, 'failed', 'Subscription ID not found');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: invoice.id }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`Invoice ${invoice.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Invoice ${invoice.id} has already been processed`);
        }

        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`Invoice ${invoice.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find UserSubscription by Stripe subscription ID
        const userSubscription = await UserSubscriptionModel.findOne({ stripeSubscriptionId: subscriptionId }).session(dbSession);

        if (!userSubscription) {
          console.error(`UserSubscription not found for subscription ${subscriptionId}`);
          throw new Error('UserSubscription not found');
        }

        // Update subscription status to ACTIVE and update currentPeriodEnd
        // Note: invoice.lines.data[0].period.end contains the period end timestamp
        const periodEnd = invoice.lines?.data?.[0]?.period?.end;
        if (periodEnd) {
          userSubscription.currentPeriodEnd = new Date(periodEnd * 1000);
        }
        userSubscription.status = UserSubscriptionStatus.ACTIVE;
        await userSubscription.save({ session: dbSession });

        console.log(`UserSubscription ${userSubscription.id} updated to ACTIVE with period end ${userSubscription.currentPeriodEnd}`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: invoice.id },
          {
            status: 'success',
            processedAt: new Date(),
            eventType: 'invoice.payment_succeeded',
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`Webhook event updated to success for invoice ${invoice.id}`);
      });
    } catch (error) {
      console.error('Error handling invoice.payment_succeeded:', error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: invoice.id },
        {
          status: 'failed',
          processedAt: new Date(),
          eventType: 'invoice.payment_succeeded',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        },
        { upsert: true }
      );

      throw error;
    } finally {
      await dbSession.endSession();
    }
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoice.parent?.subscription_details?.subscription;

    if (!subscriptionId) {
      console.error('Subscription ID not found in invoice.payment_failed event');
      await this.logWebhookEvent(invoice.id, 'invoice.payment_failed', undefined, 'failed', 'Subscription ID not found');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: invoice.id }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`Invoice ${invoice.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Invoice ${invoice.id} has already been processed`);
        }

        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`Invoice ${invoice.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find UserSubscription by Stripe subscription ID
        const userSubscription = await UserSubscriptionModel.findOne({ stripeSubscriptionId: subscriptionId }).session(dbSession);

        if (!userSubscription) {
          console.error(`UserSubscription not found for subscription ${subscriptionId}`);
          throw new Error('UserSubscription not found');
        }

        // Update subscription status to INACTIVE
        userSubscription.status = UserSubscriptionStatus.INACTIVE;
        await userSubscription.save({ session: dbSession });

        console.log(`UserSubscription ${userSubscription.id} marked as INACTIVE due to payment failure`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: invoice.id },
          {
            status: 'success',
            processedAt: new Date(),
            eventType: 'invoice.payment_failed',
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`Webhook event updated to success for invoice ${invoice.id}`);
      });
    } catch (error) {
      console.error('Error handling invoice.payment_failed:', error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: invoice.id },
        {
          status: 'failed',
          processedAt: new Date(),
          eventType: 'invoice.payment_failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        },
        { upsert: true }
      );

      throw error;
    } finally {
      await dbSession.endSession();
    }
  }

  private async logWebhookEvent(
    stripeId: string,
    eventType: string,
    orderId: string | undefined,
    status: 'success' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      const webhookEvent = new WebhookEventModel({
        stripeId,
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
      const stripeId = (event.data.object as any).id || event.id;
      const orderId = (event.data.object as any).metadata?.order_id;

      const webhookEvent = new WebhookEventModel({
        stripeId,
        eventType: event.type,
        orderId,
        processedAt: new Date(),
        status: 'pending',
        errorMessage: undefined
      });

      await webhookEvent.save();
      console.log(`Webhook event ${event.type} saved for Stripe resource ${stripeId}`);
    } catch (error) {
      console.error('Failed to save webhook event:', error);
      // Don't throw to avoid blocking webhook processing
    }
  }
}
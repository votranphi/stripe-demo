import { OrderService } from './order.service.js';
import { PaymentService } from './payment.service.js';
import { UserSubscriptionService } from './user-subscription.service.js';
import { OrderStatus } from '../models/order.model.js';
import { WebhookEventModel } from '../models/webhook-event.model.js';
import { WebhookSignatureException, DuplicateProcessingException } from '../errors/CustomError.js';
import { UserSubscriptionStatus } from '../models/user-subscription.model.js';
import { UserModel } from '../models/user.model.js';
import { WebhookEvents } from '../constants/webhook-events.js';
import Stripe from 'stripe';
import Database from '../config/database.js';

export class WebhookService {
  private readonly orderService: OrderService;
  private readonly paymentService: PaymentService;
  private readonly userSubscriptionService: UserSubscriptionService;

  constructor(
    orderService?: OrderService,
    paymentService?: PaymentService,
    userSubscriptionService?: UserSubscriptionService
  ) {
    this.orderService = orderService || new OrderService();
    this.paymentService = paymentService || new PaymentService();
    this.userSubscriptionService = userSubscriptionService || new UserSubscriptionService();
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
      case WebhookEvents.CHECKOUT_SESSION_COMPLETED:
        // Save only handled event to DB
        await this.upsertWebhookEvent((event.data.object as any).id, event.type, 'pending', (event.data.object as any).metadata?.order_id);
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case WebhookEvents.CHECKOUT_SESSION_EXPIRED:
        await this.upsertWebhookEvent((event.data.object as any).id, event.type, 'pending', (event.data.object as any).metadata?.order_id);
        await this.handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
        break;

      case WebhookEvents.CHARGE_REFUNDED:
        await this.upsertWebhookEvent((event.data.object as any).id, event.type, 'pending');
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED:
        await this.upsertWebhookEvent((event.data.object as any).id, event.type, 'pending');
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED:
        await this.upsertWebhookEvent((event.data.object as any).id, event.type, 'pending');
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case WebhookEvents.INVOICE_PAYMENT_SUCCEEDED:
        await this.upsertWebhookEvent((event.data.object as any).id, event.type, 'pending');
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case WebhookEvents.INVOICE_PAYMENT_FAILED:
        await this.upsertWebhookEvent((event.data.object as any).id, event.type, 'pending');
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case WebhookEvents.CUSTOMER_UPDATED:
        await this.upsertWebhookEvent((event.data.object as any).id, event.type, 'pending');
        await this.handleCustomerUpdated(event.data.object as Stripe.Customer, event.data.previous_attributes as Partial<Stripe.Customer> | undefined);
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
      console.error(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Order ID not found in session metadata`);
      await this.upsertWebhookEvent(session.id, WebhookEvents.CHECKOUT_SESSION_COMPLETED, 'failed', undefined, 'Order ID not found in session metadata');
      return;
    }

    if (!userId) {
      console.error(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] User ID not found in session metadata`);
      await this.upsertWebhookEvent(session.id, WebhookEvents.CHECKOUT_SESSION_COMPLETED, 'failed', orderId, 'User ID not found in session metadata');
      return;
    }

    // Verify payment status before starting transaction
    if (session.payment_status !== 'paid') {
      console.log(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Payment not completed for session ${session.id}`);
      await this.upsertWebhookEvent(session.id, WebhookEvents.CHECKOUT_SESSION_COMPLETED, 'failed', orderId, 'Payment not completed');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: session.id, eventType: WebhookEvents.CHECKOUT_SESSION_COMPLETED }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Session ${session.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Session ${session.id} has already been processed`);
        }

        // If existingEvent and the status is 'pending' or 'failed', accept retry logic
        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Session ${session.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Just do processing on Order if it's a payment's checkout.session (checkout.session has orderId in metadata)
        if (orderId) {
          // Get order within transaction
          const order = await this.orderService.getOrderById(orderId);
          if (!order) {
            console.error(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Order ${orderId} not found`);
            throw new Error('Order not found');
          }

          // Only process if order is still PENDING
          if (order.status !== OrderStatus.PENDING) {
            console.log(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Order ${orderId} is already in ${order.status} status, skipping...`);

            // Update webhool event to success because the order has been proccessed
            await WebhookEventModel.findOneAndUpdate(
              { stripeId: session.id, eventType: WebhookEvents.CHECKOUT_SESSION_COMPLETED },
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
          console.log(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Order ${orderId} marked as PAID`);

          // Update status to PROCESSING to signal fulfillment start
          await this.orderService.updateOrderStatusWithRetry(orderId, OrderStatus.PROCESSING);
          console.log(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Order ${orderId} marked as PROCESSING`);

          // Create a fresh DRAFT order for the user (new shopping cart)
          await this.orderService.createNewDraft(userId);
          console.log(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] New draft order created for user ${userId}`);
        }

        // Update webhook event to success (rather than create a new one)
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: session.id, eventType: WebhookEvents.CHECKOUT_SESSION_COMPLETED },
          {
            status: 'success',
            processedAt: new Date(),
            orderId: orderId,
            eventType: WebhookEvents.CHECKOUT_SESSION_COMPLETED,
            errorMessage: undefined
          },
          {
            upsert: true, // Create a new one if it's never existed (just in case saveWebhookEvent failed)
            session: dbSession
          }
        );
        console.log(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Webhook event updated to success for session ${session.id}`);
      });
    } catch (error) {
      console.error(`[${WebhookEvents.CHECKOUT_SESSION_COMPLETED}] Error handling event:`, error);

      // Update webhook event to failed (rather than create a new one)
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: session.id, eventType: WebhookEvents.CHECKOUT_SESSION_COMPLETED },
        {
          status: 'failed',
          processedAt: new Date(),
          orderId: orderId,
          eventType: WebhookEvents.CHECKOUT_SESSION_COMPLETED,
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
      console.error(`[${WebhookEvents.CHECKOUT_SESSION_EXPIRED}] Order ID not found in expired session metadata`);
      return;
    }

    try {
      const order = await this.orderService.getOrderById(orderId);

      if (!order) {
        console.error(`[${WebhookEvents.CHECKOUT_SESSION_EXPIRED}] Order ${orderId} not found`);
        return;
      }

      // Only update if order is still pending
      if (order.status === OrderStatus.PENDING) {
        await this.orderService.updateOrderStatus(orderId, OrderStatus.CANCELLED);
        console.log(`[${WebhookEvents.CHECKOUT_SESSION_EXPIRED}] Order ${orderId} marked as CANCELLED due to session expiration`);

        // Update webhook event status
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: session.id, eventType: WebhookEvents.CHECKOUT_SESSION_EXPIRED },
          { status: 'success' }
        );
      }
    } catch (error) {
      console.error(`[${WebhookEvents.CHECKOUT_SESSION_EXPIRED}] Error handling event:`, error);

      // Update webhook event status to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: session.id, eventType: WebhookEvents.CHECKOUT_SESSION_EXPIRED },
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
      console.error(`[${WebhookEvents.CHARGE_REFUNDED}] Payment intent ID not found in event`);
      await this.upsertWebhookEvent(charge.id, WebhookEvents.CHARGE_REFUNDED, 'failed', undefined, 'Payment intent ID not found');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: charge.id, eventType: WebhookEvents.CHARGE_REFUNDED }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`[${WebhookEvents.CHARGE_REFUNDED}] Charge ${charge.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Charge ${charge.id} has already been processed`);
        }

        // If existingEvent and the status is 'pending' or 'failed', accept retry logic
        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`[${WebhookEvents.CHARGE_REFUNDED}] Charge ${charge.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find order by payment intent ID
        const order = await this.orderService.getOrderByPaymentIntentId(paymentIntentId);

        if (!order) {
          console.error(`[${WebhookEvents.CHARGE_REFUNDED}] Order not found for payment intent ${paymentIntentId}`);
          throw new Error('Order not found for payment intent');
        }

        // Only process if order is not already CANCELLED
        if (order.status === OrderStatus.CANCELLED) {
          console.log(`[${WebhookEvents.CHARGE_REFUNDED}] Order ${order.id} is already CANCELLED, skipping...`);

          // Update webhook event to success because the order has been processed
          await WebhookEventModel.findOneAndUpdate(
            { stripeId: charge.id, eventType: WebhookEvents.CHARGE_REFUNDED },
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
        console.log(`[${WebhookEvents.CHARGE_REFUNDED}] Order ${order.id} marked as CANCELLED due to Stripe Dashboard refund (skipRefund=true)`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: charge.id, eventType: WebhookEvents.CHARGE_REFUNDED },
          {
            status: 'success',
            processedAt: new Date(),
            orderId: order.id,
            eventType: WebhookEvents.CHARGE_REFUNDED,
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`[${WebhookEvents.CHARGE_REFUNDED}] Webhook event updated to success for charge ${charge.id}`);
      });
    } catch (error) {
      console.error(`[${WebhookEvents.CHARGE_REFUNDED}] Error handling event:`, error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: charge.id, eventType: WebhookEvents.CHARGE_REFUNDED },
        {
          status: 'failed',
          processedAt: new Date(),
          eventType: WebhookEvents.CHARGE_REFUNDED,
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
      console.error(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] Customer ID not found in subscription.created event`);
      await this.upsertWebhookEvent(subscription.id, WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED, 'failed', undefined, 'Customer ID not found');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: subscription.id, eventType: WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] Subscription ${subscription.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Subscription ${subscription.id} has already been processed`);
        }

        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] Subscription ${subscription.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find user by Stripe Customer ID
        const user = await UserModel.findOne({ stripeCustomerId }).session(dbSession);

        if (!user) {
          console.error(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] User not found for Stripe customer ${stripeCustomerId}`);
          throw new Error('User not found for Stripe customer');
        }

        // Determine subscription status based on Stripe subscription status. Only activate if payment is confirmed or trial is active
        let dbStatus: UserSubscriptionStatus;
        
        if (subscription.status === 'trialing' || subscription.status === 'active') {
          dbStatus = UserSubscriptionStatus.ACTIVE;
          console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] Subscription ${subscription.id} status is ${subscription.status}, setting to ACTIVE`);
        } else {
          // Status is 'incomplete', 'incomplete_expired', 'past_due', 'canceled', 'unpaid', etc.
          // Keep INACTIVE until payment succeeds (handled by invoice.payment_succeeded)
          dbStatus = UserSubscriptionStatus.INACTIVE;
          console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] Subscription ${subscription.id} status is ${subscription.status}, setting to INACTIVE`);
        }

        // Create or update UserSubscription
        const currentPeriodEnd = new Date((subscription as any).items.data[0].current_period_end * 1000);

        await this.userSubscriptionService.createOrUpdate(
          subscription.id,
          user.id,
          dbStatus,
          currentPeriodEnd,
          dbSession
        );

        console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] UserSubscription created/updated for user ${user.id}, subscription ${subscription.id}, status ${dbStatus}`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: subscription.id, eventType: WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED },
          {
            status: 'success',
            processedAt: new Date(),
            eventType: WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED,
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] Webhook event updated to success for subscription ${subscription.id}`);
      });
    } catch (error) {
      console.error(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED}] Error handling event:`, error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: subscription.id, eventType: WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED },
        {
          status: 'failed',
          processedAt: new Date(),
          eventType: WebhookEvents.CUSTOMER_SUBSCRIPTION_CREATED,
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
        const existingEvent = await WebhookEventModel.findOne({ stripeId: subscription.id, eventType: WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED}] Subscription deletion ${subscription.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Subscription deletion ${subscription.id} has already been processed`);
        }

        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED}] Subscription deletion ${subscription.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find and update UserSubscription
        const userSubscription = await this.userSubscriptionService.findByStripeSubscriptionId(subscription.id, dbSession);

        if (!userSubscription) {
          console.error(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED}] UserSubscription not found for subscription ${subscription.id}`);
          throw new Error('UserSubscription not found');
        }

        // Update status to INACTIVE
        await this.userSubscriptionService.updateStatus(
          subscription.id,
          UserSubscriptionStatus.INACTIVE,
          dbSession
        );

        console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED}] UserSubscription ${userSubscription.id} marked as INACTIVE`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: subscription.id, eventType: WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED },
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
        console.log(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED}] Webhook event updated to success for subscription deletion ${subscription.id}`);
      });
    } catch (error) {
      console.error(`[${WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED}] Error handling event:`, error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: subscription.id, eventType: WebhookEvents.CUSTOMER_SUBSCRIPTION_DELETED },
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
    const subscriptionId = invoice.parent?.subscription_details?.subscription as string;

    if (!subscriptionId) {
      console.error(`[${WebhookEvents.INVOICE_PAYMENT_SUCCEEDED}] Subscription ID not found in event`);
      await this.upsertWebhookEvent(invoice.id, WebhookEvents.INVOICE_PAYMENT_SUCCEEDED, 'failed', undefined, 'Subscription ID not found');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: invoice.id, eventType: WebhookEvents.INVOICE_PAYMENT_SUCCEEDED }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`[${WebhookEvents.INVOICE_PAYMENT_SUCCEEDED}] Invoice ${invoice.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Invoice ${invoice.id} has already been processed`);
        }

        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`[${WebhookEvents.INVOICE_PAYMENT_SUCCEEDED}] Invoice ${invoice.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find UserSubscription by Stripe subscription ID
        const userSubscription = await this.userSubscriptionService.findByStripeSubscriptionId(subscriptionId, dbSession);

        if (!userSubscription) {
          console.error(`[${WebhookEvents.INVOICE_PAYMENT_SUCCEEDED}] UserSubscription not found for subscription ${subscriptionId}`);
          throw new Error('UserSubscription not found');
        }

        // Update subscription status to ACTIVE and update currentPeriodEnd
        // Note: invoice.lines.data[0].period.end contains the period end timestamp
        const periodEnd = invoice.lines?.data?.[0]?.period?.end;
        if (periodEnd) {
          const currentPeriodEnd = new Date(periodEnd * 1000);
          await this.userSubscriptionService.updateStatusAndPeriodEnd(
            subscriptionId,
            UserSubscriptionStatus.ACTIVE,
            currentPeriodEnd,
            dbSession
          );
          console.log(`[${WebhookEvents.INVOICE_PAYMENT_SUCCEEDED}] UserSubscription ${userSubscription.id} updated to ACTIVE with period end ${currentPeriodEnd}`);
        } else {
          await this.userSubscriptionService.updateStatus(
            subscriptionId,
            UserSubscriptionStatus.ACTIVE,
            dbSession
          );
          console.log(`[${WebhookEvents.INVOICE_PAYMENT_SUCCEEDED}] UserSubscription ${userSubscription.id} updated to ACTIVE`);
        }

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: invoice.id, eventType: WebhookEvents.INVOICE_PAYMENT_SUCCEEDED },
          {
            status: 'success',
            processedAt: new Date(),
            eventType: WebhookEvents.INVOICE_PAYMENT_SUCCEEDED,
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`[${WebhookEvents.INVOICE_PAYMENT_SUCCEEDED}] Webhook event updated to success for invoice ${invoice.id}`);
      });
    } catch (error) {
      console.error(`[${WebhookEvents.INVOICE_PAYMENT_SUCCEEDED}] Error handling event:`, error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: invoice.id, eventType: WebhookEvents.INVOICE_PAYMENT_SUCCEEDED },
        {
          status: 'failed',
          processedAt: new Date(),
          eventType: WebhookEvents.INVOICE_PAYMENT_SUCCEEDED,
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
    const subscriptionId = invoice.parent?.subscription_details?.subscription as string;

    if (!subscriptionId) {
      console.error(`[${WebhookEvents.INVOICE_PAYMENT_FAILED}] Subscription ID not found in event`);
      await this.upsertWebhookEvent(invoice.id, WebhookEvents.INVOICE_PAYMENT_FAILED, 'failed', undefined, 'Subscription ID not found');
      return;
    }

    // Implement DB Transaction
    const dbSession = await Database.getInstance().startSession();

    try {
      await dbSession.withTransaction(async () => {
        // Check Idempotency
        const existingEvent = await WebhookEventModel.findOne({ stripeId: invoice.id, eventType: WebhookEvents.INVOICE_PAYMENT_FAILED }).session(dbSession);

        if (existingEvent && existingEvent.status === 'success') {
          console.log(`[${WebhookEvents.INVOICE_PAYMENT_FAILED}] Invoice ${invoice.id} already processed successfully at ${existingEvent.processedAt}, skipping...`);
          throw new DuplicateProcessingException(`Invoice ${invoice.id} has already been processed`);
        }

        if (existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'failed')) {
          console.log(`[${WebhookEvents.INVOICE_PAYMENT_FAILED}] Invoice ${invoice.id} has status ${existingEvent.status}, retrying processing...`);
        }

        // Find UserSubscription by Stripe subscription ID
        const userSubscription = await this.userSubscriptionService.findByStripeSubscriptionId(subscriptionId, dbSession);

        if (!userSubscription) {
          console.error(`[${WebhookEvents.INVOICE_PAYMENT_FAILED}] UserSubscription not found for subscription ${subscriptionId}`);
          throw new Error('UserSubscription not found');
        }

        // Update subscription status to INACTIVE
        await this.userSubscriptionService.updateStatus(
          subscriptionId,
          UserSubscriptionStatus.INACTIVE,
          dbSession
        );

        console.log(`[${WebhookEvents.INVOICE_PAYMENT_FAILED}] UserSubscription ${userSubscription.id} marked as INACTIVE due to payment failure`);

        // Update webhook event to success
        await WebhookEventModel.findOneAndUpdate(
          { stripeId: invoice.id, eventType: WebhookEvents.INVOICE_PAYMENT_FAILED },
          {
            status: 'success',
            processedAt: new Date(),
            eventType: WebhookEvents.INVOICE_PAYMENT_FAILED,
            errorMessage: undefined
          },
          {
            upsert: true,
            session: dbSession
          }
        );
        console.log(`[${WebhookEvents.INVOICE_PAYMENT_FAILED}] Webhook event updated to success for invoice ${invoice.id}`);
      });
    } catch (error) {
      console.error(`[${WebhookEvents.INVOICE_PAYMENT_FAILED}] Error handling event:`, error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: invoice.id, eventType: WebhookEvents.INVOICE_PAYMENT_FAILED },
        {
          status: 'failed',
          processedAt: new Date(),
          eventType: WebhookEvents.INVOICE_PAYMENT_FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        },
        { upsert: true }
      );

      throw error;
    } finally {
      await dbSession.endSession();
    }
  }

  private async handleCustomerUpdated(
    customer: Stripe.Customer,
    previousAttributes?: Partial<Stripe.Customer>
  ): Promise<void> {
    const customerId = customer.id;

    console.log(`[${WebhookEvents.CUSTOMER_UPDATED}] Processing customer update for ${customerId}`);

    // Check if default_payment_method was updated
    const paymentMethodUpdated = previousAttributes && (
      'default_source' in previousAttributes ||
      'invoice_settings' in previousAttributes
    );

    if (!paymentMethodUpdated) {
      console.log(`[${WebhookEvents.CUSTOMER_UPDATED}] Payment method was not updated for customer ${customerId}, skipping payment retry`);
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: customerId, eventType: WebhookEvents.CUSTOMER_UPDATED },
        {
          status: 'success',
          processedAt: new Date(),
          errorMessage: 'Payment method not updated, no action needed'
        }
      );
      return;
    }

    console.log(`[${WebhookEvents.CUSTOMER_UPDATED}] Payment method was updated for customer ${customerId}, attempting to retry failed payments`);

    try {
      // Attempt to retry payment for any past_due or unpaid subscriptions
      const result = await this.paymentService.retrySubscriptionPayment(customerId, WebhookEvents.CUSTOMER_UPDATED);

      if (result.retriedInvoices.length > 0) {
        console.log(`[${WebhookEvents.CUSTOMER_UPDATED}] Successfully retried ${result.retriedInvoices.length} invoice(s) for customer ${customerId}`);
      }

      if (result.errors.length > 0) {
        console.warn(`[${WebhookEvents.CUSTOMER_UPDATED}] ${result.errors.length} invoice(s) failed to retry for customer ${customerId}`);
      }

      // Update webhook event to success
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: customerId, eventType: WebhookEvents.CUSTOMER_UPDATED },
        {
          status: 'success',
          processedAt: new Date(),
          errorMessage: result.errors.length > 0 ? `Some invoices failed: ${result.errors.join('; ')}` : undefined
        }
      );

      console.log(`[${WebhookEvents.CUSTOMER_UPDATED}] Webhook event updated to success for customer ${customerId}`);
    } catch (error) {
      console.error(`[${WebhookEvents.CUSTOMER_UPDATED}] Error handling customer update:`, error);

      // Update webhook event to failed
      await WebhookEventModel.findOneAndUpdate(
        { stripeId: customerId, eventType: WebhookEvents.CUSTOMER_UPDATED },
        {
          status: 'failed',
          processedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      );

      throw error;
    }
  }

  // Helper functions

  private async upsertWebhookEvent(
    stripeId: string,
    eventType: string,
    status: 'pending' | 'success' | 'failed',
    orderId?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      await WebhookEventModel.findOneAndUpdate(
        { stripeId, eventType },
        {
          stripeId,
          eventType,
          orderId,
          processedAt: new Date(),
          status,
          errorMessage
        },
        { upsert: true }
      );
      console.log(`[${eventType}] Webhook event saved for Stripe resource ${stripeId} with status ${status}`);
    } catch (error) {
      console.error('Failed to upsert webhook event:', error);
      // Don't throw error here to avoid blocking the webhook processing
    }
  }
}
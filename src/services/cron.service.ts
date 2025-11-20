import cron from 'node-cron';
import { OrderModel, OrderStatus } from '../models/order.model.js';
import { WebhookEventModel } from '../models/webhook-event.model.js';
import stripe from '../config/stripe.js';

export class CronService {
  // Run every 5 minutes to check for failed orders
  private cronExpression = '*/5 * * * *';

  start(): void {
    console.log('Starting cron job to check failed orders...');
    
    cron.schedule(this.cronExpression, async () => {
      console.log('Running scheduled job to verify order statuses...');
      await this.verifyFailedOrders();
    });
  }

  private async verifyFailedOrders(): Promise<void> {
    try {
      // Find all failed webhook events
      const failedEvents = await WebhookEventModel.find({
        status: 'failed',
        orderId: { $exists: true, $ne: null }
      });

      if (failedEvents.length === 0) {
        console.log('No failed webhook events to process');
        return;
      }

      console.log(`Found ${failedEvents.length} failed webhook events to verify`);

      for (const event of failedEvents) {
        try {
          await this.verifyAndUpdateOrder(event.sessionId, event.orderId!);
        } catch (error) {
          console.error(`Failed to verify order for session ${event.sessionId}:`, error);
        }
      }

      // Also check for pending orders that might have been paid but not updated
      await this.checkPendingOrders();
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  }

  private async verifyAndUpdateOrder(sessionId: string, orderId: string): Promise<void> {
    try {
      // Retrieve the checkout session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // Check if payment was actually completed
      if (session.payment_status === 'paid') {
        // Get the order from database
        const order = await OrderModel.findOne({ id: orderId });

        if (!order) {
          console.error(`Order ${orderId} not found in database`);
          return;
        }

        // Update order status if still pending
        if (order.status === OrderStatus.PENDING) {
          order.status = OrderStatus.PAID;
          await order.save();
          console.log(`Order ${orderId} updated to PAID via cron job`);

          // Update webhook event status to success
          await WebhookEventModel.findOneAndUpdate(
            { sessionId },
            { 
              status: 'success',
              errorMessage: 'Recovered by cron job'
            }
          );
        }
      } else {
        console.log(`Session ${sessionId} payment status is ${session.payment_status}, no action needed`);
      }
    } catch (error) {
      console.error(`Error verifying session ${sessionId}:`, error);
      throw error;
    }
  }

  private async checkPendingOrders(): Promise<void> {
    try {
      // Find orders that are still pending for more than 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      const pendingOrders = await OrderModel.find({
        status: OrderStatus.PENDING,
        createdAt: { $lt: tenMinutesAgo },
        stripeSessionId: { $exists: true, $ne: null }
      });

      if (pendingOrders.length === 0) {
        console.log('No pending orders to check');
        return;
      }

      console.log(`Checking ${pendingOrders.length} pending orders...`);

      for (const order of pendingOrders) {
        try {
          // Directly retrieve the checkout session using stored session ID
          if (!order.stripeSessionId) {
            console.warn(`Order ${order.id} has no stripeSessionId, skipping`);
            continue;
          }

          const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);

          if (session && session.payment_status === 'paid') {
            // Payment was completed but order wasn't updated
            order.status = OrderStatus.PAID;
            await order.save();
            console.log(`Pending order ${order.id} updated to PAID via cron job`);

            // Log this recovery
            const existingEvent = await WebhookEventModel.findOne({ sessionId: session.id });
            if (!existingEvent) {
              await WebhookEventModel.create({
                sessionId: session.id,
                eventType: 'checkout.session.completed',
                orderId: order.id,
                processedAt: new Date(),
                status: 'success',
                errorMessage: 'Recovered by cron job - no webhook received'
              });
            }
          }
        } catch (error) {
          console.error(`Error checking pending order ${order.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking pending orders:', error);
    }
  }
}

import cron from 'node-cron';
import { OrderService } from './order.service.js';
import { OrderStatus } from '../models/order.model.js';
import { WebhookEventModel } from '../models/webhook-event.model.js';

export class CronService {
  private readonly orderService: OrderService;
  private readonly cronExpression = '*/5 * * * *'; // Run every 5 minutes

  constructor(orderService?: OrderService) {
    this.orderService = orderService || new OrderService();
  }

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
      } else {
        console.log(`Found ${failedEvents.length} failed webhook events to verify`);

        for (const event of failedEvents) {
          try {
            await this.verifyAndUpdateOrder(event.stripeId, event.orderId!);
          } catch (error) {
            console.error(`Failed to verify order for Stripe resource ${event.stripeId}:`, error);
          }
        }
      }

      // Process pending orders that might need status updates
      await this.orderService.processExpiredOrders();
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  }

  private async verifyAndUpdateOrder(stripeId: string, orderId: string): Promise<void> {
    try {
      // Retrieve the checkout session from Stripe via OrderService
      const { session } = await this.orderService.retrieveCheckoutSession(stripeId);

      // Check if payment was actually completed
      if (session.payment_status === 'paid') {
        // Get the order from database
        const order = await this.orderService.getOrderById(orderId);

        if (!order) {
          console.error(`Order ${orderId} not found in database`);
          return;
        }

        // Update order status if still pending via OrderService
        if (order.status === OrderStatus.PENDING) {
          await this.orderService.updateOrderStatus(orderId, OrderStatus.PAID);
          console.log(`Order ${orderId} updated to PAID via cron job`);

          // Update webhook event status to success
          await WebhookEventModel.findOneAndUpdate(
            { stripeId },
            { 
              status: 'success',
              errorMessage: 'Recovered by cron job'
            }
          );
        }
      } else {
        console.log(`Stripe resource ${stripeId} payment status is ${session.payment_status}, no action needed`);
      }
    } catch (error) {
      console.error(`Error verifying Stripe resource ${stripeId}:`, error);
      throw error;
    }
  }
}
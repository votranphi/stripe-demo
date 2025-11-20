import { Request, Response } from 'express';
import { WebhookService } from '../services/webhook.service.js';

export class WebhookController {
  private webhookService: WebhookService | null = null;

  // For lazy initialization
  private getWebhookService(): WebhookService {
    if (!this.webhookService) {
      this.webhookService = new WebhookService();
    }
    return this.webhookService;
  }

  // POST /api/v1/webhook
  webhookEventHandler = async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      // Always return 200 to prevent Stripe from retrying
      res.status(200).json({
        received: true,
        error: 'Missing stripe-signature header'
      });
      return;
    }

    try {
      // Verify webhook signature and process event
      await this.getWebhookService().handleWebhookEvent(req.body, sig as string);

      res.status(200).json({ received: true });
    } catch (error) {
      // Always return 200 even on error to prevent Stripe from retrying
      console.error('Webhook error:', error);
      res.status(200).json({
        received: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
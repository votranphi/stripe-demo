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

  // POST /api/v2/webhook
  webhookEventHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const sig = req.headers['stripe-signature'];

      if (!sig) {
        res.status(400).json({
          success: false,
          message: 'Missing stripe-signature header'
        });
        return;
      }

      // Verify webhook signature and process event
      await this.getWebhookService().handleWebhookEvent(req.body, sig as string);

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).json({
        success: false,
        message: 'Webhook handler failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
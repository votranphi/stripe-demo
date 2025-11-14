import { Request, Response } from 'express';
import { WebhookService } from '../services/webhook.service.js';

export class WebhookController {
  private webhookService: WebhookService | null = null;

  private getWebhookService(): WebhookService {
    if (!this.webhookService) {
      this.webhookService = new WebhookService();
    }
    return this.webhookService;
  }

  // POST /api/v2/webhook
  webhookEventHandler = async (req: Request, res: Response): Promise<void> => {
    
  }
}
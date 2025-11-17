import { Router } from 'express';
import { WebhookController } from '../../controllers/webhook.controller.js';

const router = Router();
const webhookController = new WebhookController();

router.post('/', webhookController.webhookEventHandler);

export default router;
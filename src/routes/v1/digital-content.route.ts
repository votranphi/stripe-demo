import { Router } from 'express';
import { DigitalContentController } from '../../controllers/digital-content.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';
import { SubscriptionMiddleware } from '../../middlewares/subscription.middleware.js';

const router = Router();
const digitalContentController = new DigitalContentController();
const authMiddleware = new AuthMiddleware();
const subscriptionMiddleware = new SubscriptionMiddleware();

router.get('/', authMiddleware.authenticate, subscriptionMiddleware.isSubscribed, digitalContentController.getContent);

export default router;

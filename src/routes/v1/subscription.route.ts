import { Router } from 'express';
import { SubscriptionController } from '../../controllers/subscription.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';

const router = Router();
const subscriptionController = new SubscriptionController();
const authMiddleware = new AuthMiddleware();

// Subscription checkout endpoint
router.post('/checkout/create-session', authMiddleware.authenticate, subscriptionController.createCheckoutSession);

export default router;

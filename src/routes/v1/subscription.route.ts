import { Router } from 'express';
import { SubscriptionController } from '../../controllers/subscription.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';

const router = Router();
const subscriptionController = new SubscriptionController();
const authMiddleware = new AuthMiddleware();

router.post('/checkout/create-session', authMiddleware.authenticate, subscriptionController.createCheckoutSession);
router.get('/checkout/success', subscriptionController.checkoutSuccess);
router.get('/checkout/cancel', subscriptionController.checkoutCancel);
router.get('/me', authMiddleware.authenticate, subscriptionController.getMySubscription);
router.post('/portal-session', authMiddleware.authenticate, subscriptionController.createPortalSession);
router.delete('/:id', authMiddleware.authenticate, subscriptionController.cancelSubscription);

export default router;

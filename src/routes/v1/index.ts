import { Router } from 'express';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';
import productRoutes from './product.routes.js';
import orderRoutes from './order.route.js';
import webhookRoutes from './webhook.route.js';
import authRoutes from './auth.route.js';
import subscriptionRoutes from './subscription.route.js';
import subscriptionPlanRoutes from './subscription-plan.route.js';
import digitalContentRoutes from './digital-content.route.js';
import adminRoutes from './admin/index.js';

const router = Router();
const authMiddleware = new AuthMiddleware();

router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/webhook', webhookRoutes);
router.use('/auth', authRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/subscription-plans', subscriptionPlanRoutes);
router.use('/digital-content', digitalContentRoutes);
router.use('/admin', authMiddleware.authenticate, authMiddleware.isAdmin, adminRoutes);

export default router;
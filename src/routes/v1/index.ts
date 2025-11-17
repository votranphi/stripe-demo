import { Router } from 'express';
import productRoutes from './product.routes.js';
import orderRoutes from './order.route.js';
import webhookRoutes from './webhook.route.js';

const router = Router();

router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/webhook', webhookRoutes);

export default router;
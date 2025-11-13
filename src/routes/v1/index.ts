import { Router } from 'express';
import productRoutes from './product.routes.js';
import orderRoutes from './order.route.js';

const router = Router();

router.use('/products', productRoutes);
router.use('/order', orderRoutes);

export default router;
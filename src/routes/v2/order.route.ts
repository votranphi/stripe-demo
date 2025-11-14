import { Router } from 'express';
import { OrderController } from '../../controllers/order.controller.js';

const router = Router();
const orderController = new OrderController();

router.post('/', orderController.createOrderV2);
router.get('/success', orderController.checkoutSuccessV2);
router.get('/cancel', orderController.checkoutCancelV2);

export default router;
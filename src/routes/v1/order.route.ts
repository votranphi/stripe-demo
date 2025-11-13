import { Router } from 'express';
import { OrderController } from '../../controllers/order.controller.js';

const router = Router();
const orderController = new OrderController();

router.post('/', orderController.createOrder);
router.get('/success', orderController.checkoutSuccess);
router.get('/cancel', orderController.checkoutCancel);
router.get('/:id', orderController.getOrderById);

export default router;
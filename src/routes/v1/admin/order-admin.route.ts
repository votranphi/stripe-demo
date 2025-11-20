import { Router } from 'express';
import { OrderController } from '../../../controllers/order.controller.js';

const router = Router();
const orderController = new OrderController();

router.get('/', orderController.getAllOrdersByAdmin);
router.put('/:id/status', orderController.updateOrderStatusByAdmin);

export default router;
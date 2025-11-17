
import { Router } from 'express';
import { OrderController } from '../../controllers/order.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';


const router = Router();
const orderController = new OrderController();
const authMiddleware = new AuthMiddleware();

router.post('/', authMiddleware.authenticate, orderController.createOrder);
router.get('/success', orderController.checkoutSuccess);
router.get('/cancel', orderController.checkoutCancel);

export default router;
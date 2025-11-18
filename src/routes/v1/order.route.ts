
import { Router } from 'express';
import { OrderController } from '../../controllers/order.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';

const router = Router();
const orderController = new OrderController();
const authMiddleware = new AuthMiddleware();

// Cart/Draft endpoints
router.get('/draft', authMiddleware.authenticate, orderController.getDraft);
router.post('/draft/items', authMiddleware.authenticate, orderController.addItemToDraft);
router.delete('/draft/items/:productId', authMiddleware.authenticate, orderController.removeItemFromDraft);
router.patch('/draft/items/:productId', authMiddleware.authenticate, orderController.updateItemQuantity);

// Checkout endpoints
router.post('/checkout/create-session', authMiddleware.authenticate, orderController.createCheckoutSession);
router.get('/checkout/success', orderController.checkoutSuccess);
router.get('/checkout/cancel', orderController.checkoutCancel);

export default router;
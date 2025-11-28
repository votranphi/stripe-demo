import { Router } from 'express';
import { SubscriptionPlanController } from '../../controllers/subscription-plan.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';

const router = Router();
const subscriptionPlanController = new SubscriptionPlanController();
const authMiddleware = new AuthMiddleware();

router.post('/', authMiddleware.authenticate, authMiddleware.isAdmin, subscriptionPlanController.createPlan);
router.get('/', authMiddleware.authenticate, subscriptionPlanController.getAllPlans);
router.get('/:id', authMiddleware.authenticate, subscriptionPlanController.getPlanById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.isAdmin, subscriptionPlanController.updatePlan);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.isAdmin, subscriptionPlanController.deletePlan);

export default router;

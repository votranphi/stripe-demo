
import { Router } from 'express';
import { AuthController } from '../../controllers/auth.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';


const router = Router();
const authController = new AuthController();
const authMiddleware = new AuthMiddleware();

router.post('/register', authController.register);
router.post('/login', authMiddleware.authenticate, authController.login);

export default router;
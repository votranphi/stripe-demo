
import { Router } from 'express';
import { ProductController } from '../../controllers/product.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';


const router = Router();
const productController = new ProductController();
const authMiddleware = new AuthMiddleware();


router.post('/', authMiddleware.authenticate, productController.createProduct);
router.get('/', authMiddleware.authenticate, productController.getAllProducts);

export default router;
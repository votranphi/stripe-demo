
import { Router } from 'express';
import { ProductController } from '../../controllers/product.controller.js';
import { AuthMiddleware } from '../../middlewares/auth.middleware.js';

const router = Router();
const productController = new ProductController();
const authMiddleware = new AuthMiddleware();

router.post('/', authMiddleware.authenticate, authMiddleware.isAdmin, productController.createProduct);
router.get('/', authMiddleware.authenticate, productController.getAllProducts);
router.get('/:id', authMiddleware.authenticate, productController.getProductById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.isAdmin, productController.updateProduct);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.isAdmin, productController.deleteProduct);

export default router;
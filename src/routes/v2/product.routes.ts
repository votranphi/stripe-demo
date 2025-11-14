import { Router } from 'express';
import { ProductController } from '../../controllers/product.controller.js';

const router = Router();
const productController = new ProductController();

router.get('/', productController.getAllProductsV2);
router.post('/', productController.createProductV2);

export default router;
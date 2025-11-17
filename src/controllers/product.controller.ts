import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { createProductSchema } from '../validators/product.validator.js';
import { asyncHandler } from '../middlewares/error.middleware.js';

export class ProductController {
  private productService: ProductService | null = null;

  // For lazy initialization
  private getProductService(): ProductService {
    if (!this.productService) {
      this.productService = new ProductService();
    }
    return this.productService;
  }

  // GET /api/v1/products
  getAllProducts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const products = await this.getProductService().getAllProducts();
    res.status(200).json({
      success: true,
      data: products
    });
  });

  // POST /api/v1/products
  createProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, price, stock } = createProductSchema.parse(req.body);
    const product = await this.getProductService().createProduct({ name, price, stock });
    res.status(201).json({
      success: true,
      data: product
    });
  });
}
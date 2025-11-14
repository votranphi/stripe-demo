import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { createProductSchema } from '../validators/product.validator.js';

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
  getAllProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const products = await this.getProductService().getAllProducts();
      res.status(200).json({
        success: true,
        data: products
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // POST /api/v1/products
  createProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body using Zod schema
      const parseResult = createProductSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: 'Invalid product data',
          errors: parseResult.error.issues
        });
        return;
      }
      const { name, price, stock } = parseResult.data;
      const product = await this.getProductService().createProduct({ name, price, stock });
      res.status(201).json({
        success: true,
        data: product
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // GET /api/v2/products
  getAllProductsV2 = async (req: Request, res: Response): Promise<void> => {
    // Reuse the old version
    await this.getAllProducts(req, res);
  };

  // POST /api/v2/products
  createProductV2 = async (req: Request, res: Response): Promise<void> => {
    // Reuse the old version
    await this.createProduct(req, res);
  };
}
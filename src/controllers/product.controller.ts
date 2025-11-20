import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { CreateUpdateProductDTO } from '../dtos/product.dto.js';
import { asyncHandler } from '../middlewares/error.middleware.js';
import { ProductNotFoundException } from '../errors/CustomError.js';

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
    const dto = new CreateUpdateProductDTO(req.body);
    const product = await this.getProductService().createProduct(dto);
    res.status(201).json({
      success: true,
      data: product
    });
  });

  // GET /api/v1/products/:id
  getProductById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const product = await this.getProductService().getProductById(id);
    if (!product) {
      throw new ProductNotFoundException(id);
    }
    res.status(200).json({ success: true, data: product });
  });

  // PUT /api/v1/products/:id
  updateProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    // Validate request body using DTO
    const dto = new CreateUpdateProductDTO(req.body);
    const updated = await this.getProductService().updateProduct(id, dto);
    if (!updated) {
      throw new ProductNotFoundException(id);
    }
    res.status(200).json({ success: true, data: updated });
  });

  // DELETE /api/v1/products/:id
  deleteProduct = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const deleted = await this.getProductService().deleteProduct(id);
    if (!deleted) {
      throw new ProductNotFoundException(id);
    }
    res.status(200).json({ success: true, message: 'Product deleted' });
  });
}
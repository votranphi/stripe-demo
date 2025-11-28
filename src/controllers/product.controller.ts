import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { CreateUpdateProductDTO } from '../dtos/product.dto.js';
import { ErrorMiddleware } from '../middlewares/error.middleware.js';
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
  getAllProducts = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const result = await this.getProductService().getAllProducts(page, limit);
    res.status(200).json({
      success: true,
      data: result.products,
      pagination: {
        page: result.page,
        limit: limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  });

  // POST /api/v1/products
  createProduct = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const dto = new CreateUpdateProductDTO(req.body);
    const product = await this.getProductService().createProduct(dto);
    res.status(201).json({
      success: true,
      data: product
    });
  });

  // GET /api/v1/products/:id
  getProductById = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const product = await this.getProductService().getProductById(id);
    if (!product) {
      throw new ProductNotFoundException(id);
    }
    res.status(200).json({ success: true, data: product });
  });

  // PUT /api/v1/products/:id
  updateProduct = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  deleteProduct = ErrorMiddleware.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const deleted = await this.getProductService().deleteProduct(id);
    if (!deleted) {
      throw new ProductNotFoundException(id);
    }
    res.status(200).json({ success: true, message: 'Product deleted' });
  });
}
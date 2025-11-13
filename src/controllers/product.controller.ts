import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';

export class ProductController {
  private productService: ProductService | null = null;

  // For lazy initialization
  private getProductService(): ProductService {
    if (!this.productService) {
      this.productService = new ProductService();
    }
    return this.productService;
  }

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

  getProductById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Product ID is required'
        });
        return;
      }

      const product = await this.getProductService().getProductById(id);

      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      res.status(200).json({
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

  createProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, price, stock } = req.body;

      if (!name || typeof price !== 'number' || typeof stock !== 'number') {
        res.status(400).json({
          success: false,
          message: 'Invalid product data'
        });
        return;
      }

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

  updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Product ID is required'
        });
        return;
      }

      const { name, price, stock } = req.body;

      const updateData: { name?: string; price?: number; stock?: number } = {};
      if (name) updateData.name = name;
      if (typeof price === 'number') updateData.price = price;
      if (typeof stock === 'number') updateData.stock = stock;

      const product = await this.getProductService().updateProduct(id, updateData);

      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      res.status(200).json({
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

  deleteProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Product ID is required'
        });
        return;
      }

      const deleted = await this.getProductService().deleteProduct(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Product deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}
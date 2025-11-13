import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';

export class ProductController {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  getAllProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const products = await this.productService.getAllProducts();
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
      const product = await this.productService.getProductById(id);

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
      const { name, price } = req.body;

      if (!name || typeof price !== 'number') {
        res.status(400).json({
          success: false,
          message: 'Invalid product data'
        });
        return;
      }

      const product = await this.productService.createProduct({ name, price });

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
      const { name, price } = req.body;

      const updateData: { name?: string; price?: number } = {};
      if (name) updateData.name = name;
      if (typeof price === 'number') updateData.price = price;

      const product = await this.productService.updateProduct(id, updateData);

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
      const deleted = await this.productService.deleteProduct(id);

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
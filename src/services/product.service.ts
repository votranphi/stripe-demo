// ...existing code...
import { Product, ProductModel } from '../models/product.model.js';
import {
  DatabaseException,
  ProductCreationException,
  ProductUpdateException
} from '../errors/CustomError.js';

export class ProductService {
  async getAllProducts(): Promise<Product[]> {
    try {
      const products = await ProductModel.find({});
      return products.map(product => ({
        id: product.id,
        name: product.name,
        price: product.price,
        stock: product.stock
      }));
    } catch (error) {
      throw new DatabaseException('fetch products', error instanceof Error ? error : undefined);
    }
  }

  async getProductById(id: string): Promise<Product | null> {
    try {
      const product = await ProductModel.findOne({ id });
      if (!product) {
        return null;
      }
      return {
        id: product.id,
        name: product.name,
        price: product.price,
        stock: product.stock
      };
    } catch (error) {
      throw new DatabaseException('fetch product', error instanceof Error ? error : undefined);
    }
  }

  async createProduct(productData: Omit<Product, 'id'>): Promise<Product> {
    try {
      const newProduct = new ProductModel({
        id: crypto.randomUUID(),
        name: productData.name,
        price: productData.price,
        stock: productData.stock
      });

      await newProduct.save();

      return {
        id: newProduct.id,
        name: newProduct.name,
        price: newProduct.price,
        stock: newProduct.stock
      };
    } catch (error) {
      throw new ProductCreationException(
        productData.name,
        error instanceof Error ? error : undefined
      );
    }
  }

  async updateProduct(
    id: string,
    productData: Partial<Omit<Product, 'id'>>
  ): Promise<Product | null> {
    try {
      const result = await ProductModel.findOneAndUpdate(
        { id },
        { $set: productData },
        { new: true }
      );

      if (!result) {
        return null;
      }

      return {
        id: result.id,
        name: result.name,
        price: result.price,
        stock: result.stock
      };
    } catch (error) {
      throw new ProductUpdateException(id, error instanceof Error ? error : undefined);
    }
  }
  async deleteProduct(id: string): Promise<boolean> {
    try {
      const result = await ProductModel.findOneAndDelete({ id });
      return !!result;
    } catch (error) {
      throw new DatabaseException('delete product', error instanceof Error ? error : undefined);
    }
  }
}
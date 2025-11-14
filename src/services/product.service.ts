import { Product, ProductModel } from '../models/product.model.js';

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
      console.error('Error fetching products:', error);
      throw new Error('Failed to fetch products');
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
      console.error('Error fetching product:', error);
      throw new Error('Failed to fetch product');
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
      console.error('Error creating product:', error);
      throw new Error('Failed to create product');
    }
  }

  async updateProduct(id: string, productData: Partial<Omit<Product, 'id'>>): Promise<Product | null> {
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
      console.error('Error updating product:', error);
      throw new Error('Failed to update product');
    }
  }
}
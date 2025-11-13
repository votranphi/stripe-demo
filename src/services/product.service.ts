import { Collection } from 'mongodb';
import Database from '../config/database.js';
import { Product, ProductDocument } from '../models/product.model.js';

export class ProductService {
  private collection: Collection<ProductDocument>;

  constructor() {
    const db = Database.getInstance().getDb();
    this.collection = db.collection<ProductDocument>('products');
  }

  async getAllProducts(): Promise<Product[]> {
    try {
      const products = await this.collection.find({}).toArray();
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
      const product = await this.collection.findOne({ id });
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
      const newProduct: ProductDocument = {
        id: crypto.randomUUID(),
        name: productData.name,
        price: productData.price,
        stock: productData.stock
      };

      await this.collection.insertOne(newProduct);

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
      const result = await this.collection.findOneAndUpdate(
        { id },
        { $set: productData },
        { returnDocument: 'after' }
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
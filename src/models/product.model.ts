import mongoose, { Schema, Document } from 'mongoose';

export enum ProductType {
  ONE_TIME = 'ONE_TIME',
  SUBSCRIPTION = 'SUBSCRIPTION'
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  type: ProductType;
  createdAt?: Date;
}

export interface ProductDocument extends Document {
  id: string;
  name: string;
  price: number;
  stock: number;
  type: ProductType;
  createdAt?: Date;
}


const productSchema = new Schema<ProductDocument>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  type: { 
    type: String, 
    enum: Object.values(ProductType), 
    default: ProductType.ONE_TIME, 
    required: true 
  }
}, {
  timestamps: true
});

export const ProductModel = mongoose.model<ProductDocument>('Product', productSchema);
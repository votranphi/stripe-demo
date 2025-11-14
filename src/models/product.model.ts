import mongoose, { Schema, Document } from 'mongoose';

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface ProductDocument extends Document {
  id: string;
  name: string;
  price: number;
  stock: number;
}

const productSchema = new Schema<ProductDocument>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true }
});

export const ProductModel = mongoose.model<ProductDocument>('Product', productSchema);
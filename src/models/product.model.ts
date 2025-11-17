import mongoose, { Schema, Document } from 'mongoose';

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  createdAt?: Date;
}

export interface ProductDocument extends Document {
  id: string;
  name: string;
  price: number;
  stock: number;
  createdAt?: Date;
}


const productSchema = new Schema<ProductDocument>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true }
}, {
  timestamps: true
});

export const ProductModel = mongoose.model<ProductDocument>('Product', productSchema);
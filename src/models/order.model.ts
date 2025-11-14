import mongoose, { Schema, Document } from 'mongoose';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID'
}

export interface OrderProduct {
  id: string;
  quantity: number;
}

export interface Order {
  id: string;
  products: OrderProduct[];
  status: OrderStatus;
}

export interface OrderDocument extends Document {
  id: string;
  products: OrderProduct[];
  status: OrderStatus;
}

const orderSchema = new Schema<OrderDocument>({
  id: { type: String, required: true, unique: true },
  products: [{
    id: { type: String, required: true },
    quantity: { type: Number, required: true }
  }],
  status: { type: String, enum: Object.values(OrderStatus), required: true }
});

export const OrderModel = mongoose.model<OrderDocument>('Order', orderSchema);
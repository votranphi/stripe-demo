import mongoose, { Schema, Document } from 'mongoose';

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

// Line item with snapshot data - prevents historical orders from changing when product details are updated in the future
export interface OrderLineItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  lineItems: OrderLineItem[];
  status: OrderStatus;
  userId: string;
  totalAmount?: number;
  stripePaymentIntentId?: string;
}

export interface OrderDocument extends Document {
  id: string;
  lineItems: OrderLineItem[];
  status: OrderStatus;
  userId: string;
  totalAmount?: number;
  stripePaymentIntentId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const orderLineItemSchema = new Schema<OrderLineItem>({
  productId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true }
}, { _id: false });

const orderSchema = new Schema<OrderDocument>({
  id: { type: String, required: true, unique: true },
  lineItems: { type: [orderLineItemSchema], required: true, default: [] },
  status: { type: String, enum: Object.values(OrderStatus), required: true },
  userId: { type: String, required: true },
  totalAmount: { type: Number, required: false },
  stripePaymentIntentId: { type: String, required: false }
}, {
  timestamps: true
});

export const OrderModel = mongoose.model<OrderDocument>('Order', orderSchema);
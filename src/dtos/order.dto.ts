import { z } from 'zod';

export class AddItemDTO {
  static schema = z.object({
    productId: z.uuid('Invalid product ID format'),
    quantity: z.number().int().positive('Quantity must be a positive integer'),
  });

  productId: string;
  quantity: number;

  constructor(data: unknown) {
    const parsed = AddItemDTO.schema.parse(data);
    this.productId = parsed.productId;
    this.quantity = parsed.quantity;
  }
}

export class UpdateItemDTO {
  static schema = z.object({
    quantity: z.number().int().positive('Quantity must be a positive integer'),
  });

  quantity: number;

  constructor(data: unknown) {
    const parsed = UpdateItemDTO.schema.parse(data);
    this.quantity = parsed.quantity;
  }
}

export class UpdateOrderStatusDTO {
  static schema = z.object({
    status: z.enum([
      'DRAFT',
      'PENDING',
      'PAID',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
    ], { message: 'Invalid order status' })
  });

  status: string;

  constructor(data: unknown) {
    const parsed = UpdateOrderStatusDTO.schema.parse(data);
    this.status = parsed.status;
  }
}
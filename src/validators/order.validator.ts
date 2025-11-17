
import { z } from 'zod';

export const orderProductSchema = z.object({
  id: z.uuid('Invalid product ID format'),
  quantity: z.number().int().positive('Quantity must be a positive integer')
});

export const createOrderSchema = z.object({
  products: z.array(orderProductSchema).min(1, 'At least one product is required')
});

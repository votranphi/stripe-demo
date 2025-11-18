
import { z } from 'zod';

// Validator for adding items to draft/cart
export const addItemSchema = z.object({
  productId: z.uuid('Invalid product ID format'),
  quantity: z.number().int().positive('Quantity must be a positive integer')
});

// Validator for updating item quantity in draft/cart
export const updateItemSchema = z.object({
  quantity: z.number().int().positive('Quantity must be a positive integer')
});

// Legacy validator - kept for backward compatibility if needed
export const orderProductSchema = z.object({
  id: z.uuid('Invalid product ID format'),
  quantity: z.number().int().positive('Quantity must be a positive integer')
});

export const createOrderSchema = z.object({
  products: z.array(orderProductSchema).min(1, 'At least one product is required')
});

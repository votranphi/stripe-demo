
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
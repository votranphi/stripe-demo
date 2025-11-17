import { z } from 'zod';
import { UserRole } from '../models/user.model.js';

export const registerSchema = z.object({
  email: z.email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password must not exceed 100 characters'),
  role: z.enum(UserRole).optional()
});

export const loginSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});
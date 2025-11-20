import { z } from 'zod';
import { UserRole } from '../models/user.model.js';

export class RegisterDTO {
  static schema = z.object({
    email: z.email('Invalid email format'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(100, 'Password must not exceed 100 characters'),
    role: z.enum(UserRole).optional(),
  });

  email: string;
  password: string;
  role?: UserRole;

  constructor(data: unknown) {
    const parsed = RegisterDTO.schema.parse(data);
    this.email = parsed.email;
    this.password = parsed.password;
    this.role = parsed.role;
  }
}

export class LoginDTO {
  static schema = z.object({
    email: z.email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  });

  email: string;
  password: string;

  constructor(data: unknown) {
    const parsed = LoginDTO.schema.parse(data);
    this.email = parsed.email;
    this.password = parsed.password;
  }
}

import { z } from 'zod';

export class CreateUpdateProductDTO {
  static schema = z.object({
    name: z.string().min(1, 'Product name is required'),
    price: z.number().positive('Price must be positive'),
    stock: z.number().int().nonnegative('Stock must be a non-negative integer'),
  });

  name: string;
  price: number;
  stock: number;

  constructor(data: unknown) {
    const parsed = CreateUpdateProductDTO.schema.parse(data);
    this.name = parsed.name;
    this.price = parsed.price;
    this.stock = parsed.stock;
  }
}

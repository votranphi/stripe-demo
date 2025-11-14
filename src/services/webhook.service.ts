import { OrderService } from './order.service.js';
import { ProductService } from './product.service.js';

export class WebhookService {
  private productService: ProductService;
  private orderService: OrderService;

  constructor() {
    this.productService = new ProductService();
    this.orderService = new OrderService();
  }
}
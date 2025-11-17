import Database from '../config/database.js';
import { Order, OrderModel, OrderStatus, OrderProduct } from '../models/order.model.js';
import { ProductService } from './product.service.js';
import stripe from '../config/stripe.js';
import {
  ProductNotFoundException,
  InsufficientStockException,
  OrderNotFoundException,
  DatabaseException,
  CheckoutSessionException,
  InvalidOrderStatusException
} from '../errors/CustomError.js';

export class OrderService {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  async createOrder(products: OrderProduct[]): Promise<Order> {
    // Validate products exist and have sufficient stock
    await this.validateProducts(products);

    // Tentatively decrement stock for each product
    await this.decrementProductStock(products);

    try {
      const newOrder = new OrderModel({
        id: crypto.randomUUID(),
        products: products,
        status: OrderStatus.PENDING
      });

      await newOrder.save();

      return {
        id: newOrder.id,
        products: newOrder.products,
        status: newOrder.status
      };
    } catch (error) {
      throw new DatabaseException('create order', error instanceof Error ? error : undefined);
    }
  }

  // V2: Create order with database transactions
  async createOrderV2(products: OrderProduct[]): Promise<Order> {
    const session = await Database.getInstance().startSession();

    try {
      let newOrder: Order | null = null;

      await session.withTransaction(async () => {
        // Validate products exist and have sufficient stock
        await this.validateProducts(products);

        // Decrement stock for each product
        await this.decrementProductStock(products);

        // Create order
        const orderDoc = new OrderModel({
          id: crypto.randomUUID(),
          products: products,
          status: OrderStatus.PENDING
        });

        await orderDoc.save({ session });

        newOrder = {
          id: orderDoc.id,
          products: orderDoc.products,
          status: orderDoc.status
        };
      });

      return newOrder!;
    } catch (error) {
      // Re-throw custom errors as-is
      if (error instanceof ProductNotFoundException || error instanceof InsufficientStockException) {
        throw error;
      }
      throw new DatabaseException('create order with transaction', error instanceof Error ? error : undefined);
    } finally {
      await session.endSession();
    }
  }

  async getOrderById(id: string): Promise<Order | null> {
    try {
      const order = await OrderModel.findOne({ id });
      if (!order) {
        return null;
      }
      return {
        id: order.id,
        products: order.products,
        status: order.status
      };
    } catch (error) {
      throw new DatabaseException('fetch order', error instanceof Error ? error : undefined);
    }
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
    try {
      const result = await OrderModel.findOneAndUpdate(
        { id },
        { $set: { status } },
        { new: true }
      );

      if (!result) {
        return null;
      }

      return {
        id: result.id,
        products: result.products,
        status: result.status
      };
    } catch (error) {
      throw new DatabaseException('update order status', error instanceof Error ? error : undefined);
    }
  }

  async createCheckoutSession(orderId: string, version: 'v1' | 'v2' = 'v1'): Promise<string> {
    const order = await this.getOrderById(orderId);
    if (!order) {
      throw new OrderNotFoundException(orderId);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new InvalidOrderStatusException(order.status);
    }

    // Build line items for Stripe
    const lineItems = await this.buildStripeLineItems(order.products);

    const successUrl = `${process.env.BASE_URL}/api/${version}/orders/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.BASE_URL}/api/${version}/orders/cancel`;

    try {
      // Create Stripe Checkout Session with order_id in metadata
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          order_id: orderId
        }
      });

      if (!session.url) {
        throw new CheckoutSessionException('Stripe session URL is null');
      }

      return session.url;
    } catch (error) {
      if (error instanceof CheckoutSessionException) {
        throw error;
      }
      throw new CheckoutSessionException(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  async retrieveCheckoutSession(sessionId: string): Promise<{ orderId: string; session: any }> {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (!session.metadata?.order_id) {
        throw new CheckoutSessionException('Order ID not found in session metadata');
      }

      return {
        orderId: session.metadata.order_id,
        session: session
      };
    } catch (error) {
      if (error instanceof CheckoutSessionException) {
        throw error;
      }
      throw new CheckoutSessionException(
        error instanceof Error ? error.message : 'Failed to retrieve session'
      );
    }
  }

  // Update order status with retry logic
  async updateOrderStatusWithRetry(
    orderId: string,
    status: OrderStatus,
    maxRetries: number = 3
  ): Promise<Order | null> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      try {
        return await this.updateOrderStatus(orderId, status);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempt++;
        console.error(`Attempt ${attempt} failed for order ${orderId}:`, lastError.message);

        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new DatabaseException(
      `update order status after ${maxRetries} attempts`,
      lastError || undefined
    );
  }

  // Private helper methods

  private async validateProducts(products: OrderProduct[]): Promise<void> {
    for (const item of products) {
      const product = await this.productService.getProductById(item.id);
      if (!product) {
        throw new ProductNotFoundException(item.id);
      }
      if (product.stock < item.quantity) {
        throw new InsufficientStockException(product.name);
      }
    }
  }

  private async decrementProductStock(products: OrderProduct[]): Promise<void> {
    for (const item of products) {
      const product = await this.productService.getProductById(item.id);
      if (product) {
        await this.productService.updateProduct(item.id, {
          stock: product.stock - item.quantity
        });
      }
    }
  }

  private async buildStripeLineItems(products: OrderProduct[]): Promise<any[]> {
    return Promise.all(
      products.map(async (item) => {
        const product = await this.productService.getProductById(item.id);
        if (!product) {
          throw new ProductNotFoundException(item.id);
        }

        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name
            },
            unit_amount: product.price
          },
          quantity: item.quantity
        };
      })
    );
  }
}
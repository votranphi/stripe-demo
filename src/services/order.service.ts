import { Collection, ClientSession } from 'mongodb';
import Database from '../config/database.js';
import { Order, OrderDocument, OrderStatus, OrderProduct } from '../models/order.model.js';
import { ProductService } from './product.service.js';
import stripe from '../config/stripe.js';
import { ProductNotFoundException, InsufficientStockException, OrderNotFoundException } from '../errors/CustomError.js';

export class OrderService {
  private collection: Collection<OrderDocument>;
  private productService: ProductService;
  private processedSessions: Set<string> = new Set();

  constructor() {
    const db = Database.getInstance().getDb();
    this.collection = db.collection<OrderDocument>('orders');
    this.productService = new ProductService();
  }

  async createOrder(products: OrderProduct[]): Promise<Order> {
    try {
      // Validate products exist and have sufficient stock, then tentatively decrement stock
      for (const item of products) {
        const product = await this.productService.getProductById(item.id);
        if (!product) {
          throw new Error(`Product with id ${item.id} not found`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ${product.name}`);
        }
      }

      // Tentatively decrement stock for each product
      for (const item of products) {
        const product = await this.productService.getProductById(item.id);
        if (product) {
          await this.productService.updateProduct(item.id, { stock: product.stock - item.quantity });
        }
      }

      const newOrder: OrderDocument = {
        id: crypto.randomUUID(),
        products: products,
        status: OrderStatus.PENDING
      };

      await this.collection.insertOne(newOrder);

      return {
        id: newOrder.id,
        products: newOrder.products,
        status: newOrder.status
      };
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  // V2: Create order with database transactions
  async createOrderV2(products: OrderProduct[]): Promise<Order> {
    const session = Database.getInstance().getClient().startSession();
    
    try {
      let newOrder: Order | null = null;

      await session.withTransaction(async () => {
        // Validate products exist and have sufficient stock
        for (const item of products) {
          const product = await this.productService.getProductById(item.id);
          if (!product) {
            throw new ProductNotFoundException(item.id);
          }
          if (product.stock < item.quantity) {
            throw new InsufficientStockException(product.name);
          }
        }

        // Decrement stock for each product
        for (const item of products) {
          const product = await this.productService.getProductById(item.id);
          if (product) {
            await this.productService.updateProduct(item.id, { stock: product.stock - item.quantity });
          }
        }

        // Create order
        const orderDoc: OrderDocument = {
          id: crypto.randomUUID(),
          products: products,
          status: OrderStatus.PENDING
        };

        await this.collection.insertOne(orderDoc, { session });

        newOrder = {
          id: orderDoc.id,
          products: orderDoc.products,
          status: orderDoc.status
        };
      });

      return newOrder!;
    } catch (error) {
      console.error('Error creating order with transaction:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getOrderById(id: string): Promise<Order | null> {
    try {
      const order = await this.collection.findOne({ id });
      if (!order) {
        return null;
      }
      return {
        id: order.id,
        products: order.products,
        status: order.status
      };
    } catch (error) {
      console.error('Error fetching order:', error);
      throw new Error('Failed to fetch order');
    }
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
    try {
      const result = await this.collection.findOneAndUpdate(
        { id },
        { $set: { status } },
        { returnDocument: 'after' }
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
      console.error('Error updating order status:', error);
      throw new Error('Failed to update order status');
    }
  }

  async createCheckoutSession(orderId: string, version: 'v1' | 'v2' = 'v1'): Promise<string> {
    try {
      const order = await this.getOrderById(orderId);
      if (!order) {
        throw new OrderNotFoundException(orderId);
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new Error('Order is not in PENDING status');
      }

      // Build line items for Stripe
      const lineItems = await Promise.all(
        order.products.map(async (item) => {
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

      const successUrl = `${process.env.BASE_URL}/api/${version}/orders/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${process.env.BASE_URL}/api/${version}/orders/cancel`;

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

      return session.url!;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      if (
        error instanceof OrderNotFoundException ||
        error instanceof ProductNotFoundException
      ) {
        throw error;
      }
      throw new Error('Failed to create checkout session');
    }
  }

  async retrieveCheckoutSession(sessionId: string): Promise<{ orderId: string; session: any }> {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (!session.metadata?.order_id) {
        throw new Error('Order ID not found in session metadata');
      }

      return {
        orderId: session.metadata.order_id,
        session: session
      };
    } catch (error) {
      console.error('Error retrieving checkout session:', error);
      throw error;
    }
  }

  // Check if session has been processed (idempotency)
  isSessionProcessed(sessionId: string): boolean {
    return this.processedSessions.has(sessionId);
  }

  // Mark session as processed
  markSessionAsProcessed(sessionId: string): void {
    this.processedSessions.add(sessionId);
  }

  // Update order status with retry logic
  async updateOrderStatusWithRetry(orderId: string, status: OrderStatus, maxRetries: number = 3): Promise<Order | null> {
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
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new Error(`Failed to update order status after ${maxRetries} attempts: ${lastError?.message}`);
  }
}
import { Collection } from 'mongodb';
import Database from '../config/database.js';
import { Order, OrderDocument, OrderStatus, OrderProduct } from '../models/order.model.js';
import { ProductService } from './product.service.js';
import stripe from '../config/stripe.js';

export class OrderService {
  private collection: Collection<OrderDocument>;
  private productService: ProductService;

  constructor() {
    const db = Database.getInstance().getDb();
    this.collection = db.collection<OrderDocument>('orders');
    this.productService = new ProductService();
  }

  async createOrder(products: OrderProduct[]): Promise<Order> {
    try {
      // Validate products exist and have sufficient stock
      for (const item of products) {
        const product = await this.productService.getProductById(item.id);
        if (!product) {
          throw new Error(`Product with id ${item.id} not found`);
        }
        // TODO: Add stock checking when inventory field is added to Product model
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

  async createCheckoutSession(orderId: string): Promise<string> {
    try {
      const order = await this.getOrderById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new Error('Order is not in PENDING status');
      }

      // Build line items for Stripe
      const lineItems = await Promise.all(
        order.products.map(async (item) => {
          const product = await this.productService.getProductById(item.id);
          if (!product) {
            throw new Error(`Product with id ${item.id} not found`);
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

      // Create Stripe Checkout Session with order_id in metadata
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${process.env.BASE_URL}/api/v1/orders/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.BASE_URL}/api/v1/orders/cancel`,
        metadata: {
          order_id: orderId
        }
      });

      return session.url!;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
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
}
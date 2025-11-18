import Database from '../config/database.js';
import { Order, OrderModel, OrderStatus, OrderLineItem } from '../models/order.model.js';
import { UserModel } from '../models/user.model.js';
import { ProductService } from './product.service.js';
import stripe from '../config/stripe.js';
import {
  ProductNotFoundException,
  InsufficientStockException,
  OrderNotFoundException,
  DraftOrderNotFoundException,
  ItemNotInDraftException,
  EmptyDraftException,
  DatabaseException,
  CheckoutSessionException,
} from '../errors/CustomError.js';

export class OrderService {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  async getUserDraft(userId: string): Promise<Order> {
    try {
      const user = await UserModel.findOne({ id: userId });
      if (!user || !user.draftOrderId) {
        throw new DraftOrderNotFoundException(userId);
      }

      const draft = await OrderModel.findOne({ id: user.draftOrderId });
      if (!draft) {
        throw new DraftOrderNotFoundException(userId);
      }

      return {
        id: draft.id,
        lineItems: draft.lineItems,
        status: draft.status,
        userId: draft.userId,
        totalAmount: draft.totalAmount
      };
    } catch (error) {
      if (error instanceof DraftOrderNotFoundException) {
        throw error;
      }
      throw new DatabaseException('fetch user draft', error instanceof Error ? error : undefined);
    }
  }

  async addItemToDraft(userId: string, productId: string, quantity: number): Promise<Order> {
    try {
      // Get draft order
      const draft = await this.getUserDraft(userId);

      // Validate product exists and has sufficient stock
      const product = await this.productService.getProductById(productId);
      if (!product) {
        throw new ProductNotFoundException(productId);
      }

      // Calculate total quantity including existing draft items
      const existingItem = draft.lineItems.find(item => item.productId === productId);
      const totalQuantity = (existingItem?.quantity || 0) + quantity;

      if (product.stock < totalQuantity) {
        throw new InsufficientStockException(product.name);
      }

      // Update or add line item
      const updatedLineItems = [...draft.lineItems];
      const itemIndex = updatedLineItems.findIndex(item => item.productId === productId);

      if (itemIndex >= 0) {
        // Update existing item
        const item = updatedLineItems[itemIndex];
        if (item) {
          item.quantity = totalQuantity;
        }
      } else {
        // Add new item with snapshot data
        updatedLineItems.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: quantity
        });
      }

      // Calculate total amount
      const totalAmount = updatedLineItems.reduce(
        (sum, item) => sum + (item.price * item.quantity),
        0
      );

      // Update draft order
      const result = await OrderModel.findOneAndUpdate(
        { id: draft.id },
        { 
          $set: { 
            lineItems: updatedLineItems,
            totalAmount: totalAmount
          } 
        },
        { new: true }
      );

      if (!result) {
        throw new OrderNotFoundException(draft.id);
      }

      return {
        id: result.id,
        lineItems: result.lineItems,
        status: result.status,
        userId: result.userId,
        totalAmount: result.totalAmount
      };
    } catch (error) {
      if (
        error instanceof DraftOrderNotFoundException ||
        error instanceof ProductNotFoundException ||
        error instanceof InsufficientStockException
      ) {
        throw error;
      }
      throw new DatabaseException('add item to draft', error instanceof Error ? error : undefined);
    }
  }

  async removeItemFromDraft(userId: string, productId: string): Promise<Order> {
    try {
      const draft = await this.getUserDraft(userId);

      // Check if item exists in draft
      const itemExists = draft.lineItems.some(item => item.productId === productId);
      if (!itemExists) {
        throw new ItemNotInDraftException(productId);
      }

      // Remove item
      const updatedLineItems = draft.lineItems.filter(item => item.productId !== productId);

      // Calculate total amount
      const totalAmount = updatedLineItems.reduce(
        (sum, item) => sum + (item.price * item.quantity),
        0
      );

      // Update draft order
      const result = await OrderModel.findOneAndUpdate(
        { id: draft.id },
        { 
          $set: { 
            lineItems: updatedLineItems,
            totalAmount: totalAmount
          } 
        },
        { new: true }
      );

      if (!result) {
        throw new OrderNotFoundException(draft.id);
      }

      return {
        id: result.id,
        lineItems: result.lineItems,
        status: result.status,
        userId: result.userId,
        totalAmount: result.totalAmount
      };
    } catch (error) {
      if (
        error instanceof DraftOrderNotFoundException ||
        error instanceof ItemNotInDraftException
      ) {
        throw error;
      }
      throw new DatabaseException('remove item from draft', error instanceof Error ? error : undefined);
    }
  }

  async updateDraftItemQuantity(userId: string, productId: string, quantity: number): Promise<Order> {
    try {
      const draft = await this.getUserDraft(userId);

      // Check if item exists in draft
      const itemIndex = draft.lineItems.findIndex(item => item.productId === productId);
      if (itemIndex < 0) {
        throw new ItemNotInDraftException(productId);
      }

      // Validate product stock
      const product = await this.productService.getProductById(productId);
      if (!product) {
        throw new ProductNotFoundException(productId);
      }

      if (product.stock < quantity) {
        throw new InsufficientStockException(product.name);
      }

      // Update quantity
      const updatedLineItems = [...draft.lineItems];
      const item = updatedLineItems[itemIndex];
      if (item) {
        item.quantity = quantity;
      }

      // Calculate total amount
      const totalAmount = updatedLineItems.reduce(
        (sum, item) => sum + (item.price * item.quantity),
        0
      );

      // Update draft order
      const result = await OrderModel.findOneAndUpdate(
        { id: draft.id },
        { 
          $set: { 
            lineItems: updatedLineItems,
            totalAmount: totalAmount
          } 
        },
        { new: true }
      );

      if (!result) {
        throw new OrderNotFoundException(draft.id);
      }

      return {
        id: result.id,
        lineItems: result.lineItems,
        status: result.status,
        userId: result.userId,
        totalAmount: result.totalAmount
      };
    } catch (error) {
      if (
        error instanceof DraftOrderNotFoundException ||
        error instanceof ItemNotInDraftException ||
        error instanceof ProductNotFoundException ||
        error instanceof InsufficientStockException
      ) {
        throw error;
      }
      throw new DatabaseException('update draft item quantity', error instanceof Error ? error : undefined);
    }
  }

  async createCheckoutFromDraft(userId: string, version: string): Promise<{ checkoutUrl: string; orderId: string }> {
    const session = await Database.getInstance().startSession();

    try {
      let checkoutUrl = '';
      let orderId = '';

      await session.withTransaction(async () => {
        // Get draft order
        const draft = await this.getUserDraft(userId);

        if (draft.lineItems.length === 0) {
          throw new EmptyDraftException();
        }

        // Validate all products still exist and have sufficient stock
        await this.validateDraftStock(draft.lineItems);

        // Reserve stock by decrementing
        await this.decrementProductStock(draft.lineItems);

        // Update draft to PENDING
        const result = await OrderModel.findOneAndUpdate(
          { id: draft.id },
          { $set: { status: OrderStatus.PENDING } },
          { new: true, session }
        );

        if (!result) {
          throw new OrderNotFoundException(draft.id);
        }

        orderId = result.id;

        // Build Stripe line items from snapshot data
        const stripeLineItems = this.buildStripeLineItems(result.lineItems);

        const successUrl = `${process.env.BASE_URL}/api/${version}/orders/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${process.env.BASE_URL}/api/${version}/orders/checkout/cancel`;

        // Create Stripe Checkout Session
        const stripeSession = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: stripeLineItems,
          mode: 'payment',
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            order_id: result.id,
            user_id: userId
          }
        });

        if (!stripeSession.url) {
          throw new CheckoutSessionException('Stripe session URL is null');
        }

        checkoutUrl = stripeSession.url;
      });

      return { checkoutUrl, orderId };
    } catch (error) {
      if (
        error instanceof EmptyDraftException ||
        error instanceof DraftOrderNotFoundException ||
        error instanceof ProductNotFoundException ||
        error instanceof InsufficientStockException ||
        error instanceof CheckoutSessionException
      ) {
        throw error;
      }
      throw new DatabaseException('create checkout from draft', error instanceof Error ? error : undefined);
    } finally {
      await session.endSession();
    }
  }

  async createNewDraft(userId: string): Promise<Order> {
    try {
      // Create new draft order
      const draftOrder = new OrderModel({
        id: crypto.randomUUID(),
        lineItems: [],
        status: OrderStatus.DRAFT,
        userId: userId,
        totalAmount: 0
      });

      await draftOrder.save();

      // Update user's draftOrderId reference
      await UserModel.findOneAndUpdate(
        { id: userId },
        { $set: { draftOrderId: draftOrder.id } }
      );

      return {
        id: draftOrder.id,
        lineItems: draftOrder.lineItems,
        status: draftOrder.status,
        userId: draftOrder.userId,
        totalAmount: draftOrder.totalAmount
      };
    } catch (error) {
      throw new DatabaseException('create new draft order', error instanceof Error ? error : undefined);
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
        lineItems: order.lineItems,
        status: order.status,
        userId: order.userId,
        totalAmount: order.totalAmount
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
        lineItems: result.lineItems,
        status: result.status,
        userId: result.userId,
        totalAmount: result.totalAmount
      };
    } catch (error) {
      throw new DatabaseException('update order status', error instanceof Error ? error : undefined);
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

  private async validateDraftStock(lineItems: OrderLineItem[]): Promise<void> {
    for (const item of lineItems) {
      const product = await this.productService.getProductById(item.productId);
      if (!product) {
        throw new ProductNotFoundException(item.productId);
      }
      if (product.stock < item.quantity) {
        throw new InsufficientStockException(product.name);
      }
    }
  }

  private async decrementProductStock(lineItems: OrderLineItem[]): Promise<void> {
    for (const item of lineItems) {
      const product = await this.productService.getProductById(item.productId);
      if (product) {
        await this.productService.updateProduct(item.productId, {
          stock: product.stock - item.quantity
        });
      }
    }
  }

  private buildStripeLineItems(lineItems: OrderLineItem[]): any[] {
    return lineItems.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name
        },
        unit_amount: item.price
      },
      quantity: item.quantity
    }));
  }
}
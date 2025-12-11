import Database from '../config/database.js';
import { Order, OrderModel, OrderStatus, OrderLineItem } from '../models/order.model.js';
import { UserService } from './user.service.js';
import { ProductService } from './product.service.js';
import { PaymentService } from './payment.service.js';
import { ProductType } from '../models/product.model.js';
import mongoose from 'mongoose';
import {
  ProductNotFoundException,
  InsufficientStockException,
  OrderNotFoundException,
  DraftOrderNotFoundException,
  ItemNotInDraftException,
  EmptyDraftException,
  InvalidProductTypeException,
  DatabaseException,
  CheckoutSessionException,
} from '../errors/CustomError.js';

export class OrderService {
  private readonly userService: UserService;
  private readonly productService: ProductService;
  private readonly paymentService: PaymentService;

  constructor(
    userService?: UserService,
    productService?: ProductService,
    paymentService?: PaymentService
  ) {
    this.userService = userService || new UserService();
    this.productService = productService || new ProductService();
    this.paymentService = paymentService || new PaymentService();
  }

  async getUserDraft(userId: string): Promise<Order> {
    try {
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new DraftOrderNotFoundException(userId);
      }

      // Check if user has a draft order ID
      if (!user.draftOrderId) {
        // Lazy creation: create draft order now
        return await this.createNewDraft(userId);
      }

      const draft = await OrderModel.findOne({ id: user.draftOrderId });
      if (!draft || draft.status !== OrderStatus.DRAFT) {
        // Create draft order now if couldn't find the DRAFT order
        return await this.createNewDraft(userId);
      }

      return {
        id: draft.id,
        lineItems: draft.lineItems,
        status: draft.status,
        userId: draft.userId,
        totalAmount: draft.totalAmount,
        stripePaymentIntentId: draft.stripePaymentIntentId,
        stripeSessionId: draft.stripeSessionId
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

      // Block subscription products from being added to cart
      if (product.type === ProductType.SUBSCRIPTION) {
        throw new InvalidProductTypeException();
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
        totalAmount: result.totalAmount,
        stripePaymentIntentId: result.stripePaymentIntentId,
        stripeSessionId: result.stripeSessionId
      };
    } catch (error) {
      if (
        error instanceof DraftOrderNotFoundException ||
        error instanceof ProductNotFoundException ||
        error instanceof InsufficientStockException ||
        error instanceof InvalidProductTypeException
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
        totalAmount: result.totalAmount,
        stripePaymentIntentId: result.stripePaymentIntentId
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
        totalAmount: result.totalAmount,
        stripePaymentIntentId: result.stripePaymentIntentId,
        stripeSessionId: result.stripeSessionId
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

        // Verify no subscription products in cart
        await this.validateNoSubscriptionProducts(draft.lineItems);

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

        const successUrl = `${process.env.FRONTEND_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${process.env.FRONTEND_BASE_URL}/cancel`;

        // Create Stripe Checkout Session via PaymentService
        const { sessionId, url } = await this.paymentService.createCheckoutSession(
          result.lineItems,
          result.id,
          userId,
          successUrl,
          cancelUrl
        );

        // Save stripe session ID to order
        await OrderModel.findOneAndUpdate(
          { id: result.id },
          { $set: { stripeSessionId: sessionId } },
          { session }
        );

        checkoutUrl = url;
      });

      return { checkoutUrl, orderId };
    } catch (error) {
      if (
        error instanceof EmptyDraftException ||
        error instanceof DraftOrderNotFoundException ||
        error instanceof ProductNotFoundException ||
        error instanceof InsufficientStockException ||
        error instanceof InvalidProductTypeException ||
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
      await this.userService.updateDraftOrderId(userId, draftOrder.id);

      return {
        id: draftOrder.id,
        lineItems: draftOrder.lineItems,
        status: draftOrder.status,
        userId: draftOrder.userId,
        totalAmount: draftOrder.totalAmount,
        stripePaymentIntentId: draftOrder.stripePaymentIntentId,
        stripeSessionId: draftOrder.stripeSessionId
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
        totalAmount: order.totalAmount,
        stripePaymentIntentId: order.stripePaymentIntentId,
        stripeSessionId: order.stripeSessionId
      };
    } catch (error) {
      throw new DatabaseException('fetch order', error instanceof Error ? error : undefined);
    }
  }

  async getOrderByPaymentIntentId(paymentIntentId: string): Promise<Order | null> {
    try {
      const order = await OrderModel.findOne({ stripePaymentIntentId: paymentIntentId });
      if (!order) {
        return null;
      }
      return {
        id: order.id,
        lineItems: order.lineItems,
        status: order.status,
        userId: order.userId,
        totalAmount: order.totalAmount,
        stripePaymentIntentId: order.stripePaymentIntentId,
        stripeSessionId: order.stripeSessionId
      };
    } catch (error) {
      throw new DatabaseException('fetch order by payment intent ID', error instanceof Error ? error : undefined);
    }
  }

  async savePaymentIntentId(id: string, paymentIntentId: string): Promise<void> {
    try {
      await OrderModel.findOneAndUpdate(
        { id },
        { $set: { stripePaymentIntentId: paymentIntentId } }
      );
    } catch (error) {
      throw new DatabaseException('save payment intent ID', error instanceof Error ? error : undefined);
    }
  }

  async updateOrderStatus(id: string, status: OrderStatus, skipRefund: boolean = false): Promise<Order | null> {
    const session = await Database.getInstance().startSession();

    try {
      let result: Order | null = null;

      await session.withTransaction(async () => {
        // Get current order first within transaction
        const currentOrder = await OrderModel.findOne({ id }).session(session);
        if (!currentOrder) {
          return;
        }

        // If changing to CANCELLED status, handle refund and restock
        if (status === OrderStatus.CANCELLED && currentOrder.status !== OrderStatus.CANCELLED) {
          // Restock products within transaction
          await this.incrementProductStock(currentOrder.lineItems, session);

          // Refund payment if order was paid (unless skipRefund is true). If refund fails, the transaction will roll back
          if (!skipRefund) {
            if (currentOrder.status === OrderStatus.PAID ||
              currentOrder.status === OrderStatus.PROCESSING ||
              currentOrder.status === OrderStatus.SHIPPED ||
              currentOrder.status === OrderStatus.DELIVERED) {
              if (currentOrder.stripePaymentIntentId) {
                await this.paymentService.createRefund(currentOrder.stripePaymentIntentId, id);
              }
            }
          }
        }

        // Update order status within transaction
        const updatedOrder = await OrderModel.findOneAndUpdate(
          { id },
          { $set: { status } },
          { new: true, session }
        );

        if (!updatedOrder) {
          return;
        }

        result = {
          id: updatedOrder.id,
          lineItems: updatedOrder.lineItems,
          status: updatedOrder.status,
          userId: updatedOrder.userId,
          totalAmount: updatedOrder.totalAmount,
          stripePaymentIntentId: updatedOrder.stripePaymentIntentId,
          stripeSessionId: updatedOrder.stripeSessionId
        };
      });

      return result;
    } catch (error) {
      throw new DatabaseException('update order status', error instanceof Error ? error : undefined);
    } finally {
      await session.endSession();
    }
  }

  async retrieveCheckoutSession(sessionId: string): Promise<{ orderId: string; session: any }> {
    try {
      const session = await this.paymentService.retrieveCheckoutSession(sessionId);

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

  async getAllOrders(page: number = 1, limit: number = 10): Promise<{ orders: Order[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      const total = await OrderModel.countDocuments({});
      const orders = await OrderModel.find({})
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      return {
        orders: orders.map(order => ({
          id: order.id,
          lineItems: order.lineItems,
          status: order.status,
          userId: order.userId,
          totalAmount: order.totalAmount,
          stripePaymentIntentId: order.stripePaymentIntentId,
          stripeSessionId: order.stripeSessionId
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new DatabaseException('fetch all orders', error instanceof Error ? error : undefined);
    }
  }

  async getOrdersByUserId(userId: string, page: number = 1, limit: number = 10): Promise<{ orders: Order[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      // Filter out DRAFT orders - only return actual orders
      const query = { 
        userId, 
        status: { $ne: OrderStatus.DRAFT } 
      };
      const total = await OrderModel.countDocuments(query);
      const orders = await OrderModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      return {
        orders: orders.map(order => ({
          id: order.id,
          lineItems: order.lineItems,
          status: order.status,
          userId: order.userId,
          totalAmount: order.totalAmount,
          stripePaymentIntentId: order.stripePaymentIntentId,
          stripeSessionId: order.stripeSessionId
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new DatabaseException('fetch user orders', error instanceof Error ? error : undefined);
    }
  }

  // Processes expired or pending orders that need status updates. This is called by CronService to handle order cleanup
  async processExpiredOrders(): Promise<void> {
    try {
      // Find orders that are still pending for more than 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      const pendingOrders = await OrderModel.find({
        status: OrderStatus.PENDING,
        createdAt: { $lt: tenMinutesAgo },
        stripeSessionId: { $exists: true, $ne: null }
      });

      console.log(`Processing ${pendingOrders.length} expired pending orders...`);

      for (const order of pendingOrders) {
        try {
          if (!order.stripeSessionId) {
            console.warn(`Order ${order.id} has no stripeSessionId, skipping`);
            continue;
          }

          // Verify session status with Stripe
          const session = await this.paymentService.retrieveCheckoutSession(order.stripeSessionId);

          // Sync order status based on Stripe's session status
          if (session.payment_status === 'paid' && order.status === OrderStatus.PENDING) {
            await this.updateOrderStatus(order.id, OrderStatus.PAID);
            console.log(`Expired order ${order.id} updated to PAID via cron job`);
          } else if (session.status === 'expired' && order.status === OrderStatus.PENDING) {
            await this.updateOrderStatus(order.id, OrderStatus.CANCELLED);
            console.log(`Expired order ${order.id} marked as CANCELLED via cron job`);
          } else if (session.payment_status === 'unpaid') {
            // Check if session is too old (e.g., more than 24 hours)
            const sessionCreatedAt = new Date(session.created * 1000);
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            if (sessionCreatedAt < twentyFourHoursAgo && order.status === OrderStatus.PENDING) {
              await this.updateOrderStatus(order.id, OrderStatus.CANCELLED);
              console.log(`Expired order ${order.id} marked as CANCELLED (unpaid too long) via cron job`);
            }
          }
        } catch (error) {
          console.error(`Error processing expired order ${order.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing expired orders:', error);
      throw new DatabaseException('process expired orders', error instanceof Error ? error : undefined);
    }
  }

  // Private helper methods

  private async validateNoSubscriptionProducts(lineItems: OrderLineItem[]): Promise<void> {
    for (const item of lineItems) {
      const product = await this.productService.getProductById(item.productId);
      if (!product) {
        throw new ProductNotFoundException(item.productId);
      }
      if (product.type === ProductType.SUBSCRIPTION) {
        throw new InvalidProductTypeException();
      }
    }
  }

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

  private async incrementProductStock(lineItems: OrderLineItem[], session?: mongoose.ClientSession): Promise<void> {
    for (const item of lineItems) {
      // Get product to verify it exists
      const product = await this.productService.getProductById(item.productId);
      if (product) {
        // Add back the quantity to stock
        await this.productService.updateProduct(item.productId, {
          stock: product.stock + item.quantity
        });
      }
    }
  }
}
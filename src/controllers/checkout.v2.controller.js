import Stripe from "stripe";
import dotenv from "dotenv";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/v2/checkout/create-session
export const createCheckoutSessionV2 = async (req, res) => {
  try {
    const productsRequest = req.body.products;
    const data = JSON.parse(fs.readFileSync("./mockData.json", "utf-8"));
    // Create new order
    const orderId = uuidv4();
    const newOrder = {
      id: orderId,
      products: productsRequest,
      status: "UNPAID"
    };
    if (!data.orders) data.orders = [];
    data.orders.push(newOrder);
    fs.writeFileSync("./mockData.json", JSON.stringify(data, null, 2));

    // Build line_items for Stripe
    const line_items = productsRequest.map(item => {
      const product = data.products.find(p => p.id === item.id);
      if (!product) return null;
      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name
          },
          unit_amount: product.price,
        },
        quantity: item.quantity
      };
    }).filter(Boolean);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: line_items,
      mode: "payment",
      success_url: "http://localhost:3000/api/v2/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:3000/api/v2/checkout/cancel",
      metadata: {
        order_id: orderId
      }
    });
    res.json({ url: session.url, order_id: orderId });
  } catch (error) {
    console.log("/api/v2/checkout/create-session - Error: ", error.message);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/v2/checkout/webhook
export const stripeWebhookHandler = (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log("/api/v2/checkout/webhook - Webhook Error: ", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle core event types
  switch (event.type) {
    case 'checkout.session.completed': {
      // Fulfill the purchase: update order status in mockData.json, idempotent by order id
      try {
        const data = JSON.parse(fs.readFileSync("./mockData.json", "utf-8"));
        const session = event.data.object;
        const orderId = session.metadata?.order_id;
        if (!orderId) {
          console.log("No order_id in session metadata.");
          break;
        }
        const order = data.orders.find(o => o.id === orderId);
        if (!order) {
          console.log(`Order ${orderId} not found.`);
          break;
        }
        // Idempotency
        if (order.status === "PAID") {
          console.log(`Order ${orderId} already PAID. Skip update.`);
          break;
        }
        order.status = "PAID";
        fs.writeFileSync("./mockData.json", JSON.stringify(data, null, 2));
        console.log(`Order ${order.id} marked as PAID.`);
      } catch (err) {
        console.log("/api/v2/checkout/webhook - Error updating order status:", err.message);
      }
      break;
    }
    case 'payment_intent.succeeded':
      // Handle successful payment intent (if needed)
      break;
    // Add more event types as needed
    default:
      // Unexpected event type
      break;
  }

  res.json({ received: true });
};

// GET /api/v2/checkout/success
export const checkoutSuccessV2 = async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session_id" });
    }
    
    // Retrieve full session object
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Verify payment status
    if (session.payment_status === 'paid') {
      res.json({ 
        message: "Payment success.",
        order_id: session.metadata?.order_id,
        amount_total: session.amount_total
      });
    } else {
      res.json({ message: "Payment not completed" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/v2/checkout/cancel
export const checkoutCancelV2 = (req, res) => {
  res.json({ message: "Payment canceled." });
};

import Stripe from "stripe";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/v1/checkout/create-session
export const createCheckoutSession = async (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync("./mockData.json", "utf-8"));
    console.log("Data: ", data);
    const orderId = req.body.order?.id;
    const order = data.orders.find(o => o.id === orderId);
    if (!order) {
      return res.status(400).json({ error: "Order not found" });
    }
    const line_items = order.products.map(item => {
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
      success_url: "http://localhost:3000/api/v1/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:3000/api/v1/checkout/cancel",
    });
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/v1/checkout/success
export const checkoutSuccess = async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id in query params" });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({ message: "Payment successful!", session });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/v1/checkout/cancel
export const checkoutCancel = (req, res) => {
  res.json({ message: "Payment canceled." });
};

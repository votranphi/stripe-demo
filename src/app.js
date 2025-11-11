import express from "express";
import dotenv from "dotenv";
import checkoutRoutes from "./routes/checkout.routes.js";
import checkoutV2Routes from "./routes/checkout.v2.routes.js";
import { stripeWebhookHandler } from "./controllers/checkout.v2.controller.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;


// Stripe webhook raw body middleware (must be before express.json)
app.post("/api/v2/checkout/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

// Middleware for parsing JSON (for all other routes)
app.use(express.json());

// Register v1 checkout routes
app.use("/api/v1/checkout", checkoutRoutes);

// Register v2 checkout routes (except webhook)
app.use("/api/v2/checkout", checkoutV2Routes);

// Run server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

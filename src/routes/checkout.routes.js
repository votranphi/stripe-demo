import express from "express";
import { createCheckoutSession, checkoutSuccess, checkoutCancel } from "../controllers/checkout.controller.js";

const router = express.Router();

// POST /api/v1/checkout/create-session
router.post("/create-session", createCheckoutSession);

// GET /api/v1/checkout/success
router.get("/success", checkoutSuccess);

// GET /api/v1/checkout/cancel
router.get("/cancel", checkoutCancel);

export default router;

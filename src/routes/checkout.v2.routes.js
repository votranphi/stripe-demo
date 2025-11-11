import express from "express";
import { createCheckoutSessionV2, checkoutSuccessV2, checkoutCancelV2 } from "../controllers/checkout.v2.controller.js";
import { body, validationResult } from "express-validator";

const router = express.Router();

// POST /api/v2/checkout/create-session
router.post(
	"/create-session",
	[
		body("products").isArray({ min: 1 }).withMessage("products must be a non-empty array"),
		body("products.*.id").isString().withMessage("product id must be a string"),
		body("products.*.quantity").isInt({ min: 1 }).withMessage("quantity must be a positive integer")
	],
	(req, res, next) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({ errors: errors.array() });
		}
		next();
	},
	createCheckoutSessionV2
);

// GET /api/v2/checkout/success
router.get("/success", checkoutSuccessV2);

// GET /api/v2/checkout/cancel
router.get("/cancel", checkoutCancelV2);

export default router;

import { Router } from "express";
import adminOrderRoutes from "./order-admin.route.js"

const router = Router();

router.use('/orders', adminOrderRoutes)

export default router;
import { Router } from 'express';
import v1Routes from './v1/index.js';

const router = Router();

router.use('/v1', v1Routes);

// Có thể thêm v2 routes trong tương lai
// router.use('/v2', v2Routes);

export default router;
import { Router } from 'express';
import { bushaWebhookController } from '../../controllers/webhooks/busha.webhook.controller';

const router = Router();

/** Mounted at `/api/v2/webhooks/busha` (with rawBody capture) → POST / */
router.post('/', bushaWebhookController);

export default router;

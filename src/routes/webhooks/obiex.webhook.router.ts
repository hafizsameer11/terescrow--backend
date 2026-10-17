import { Router } from 'express';
import { obiexWebhookController } from '../../controllers/webhooks/obiex.webhook.controller';

const router = Router();
router.post('/', obiexWebhookController);
export default router;

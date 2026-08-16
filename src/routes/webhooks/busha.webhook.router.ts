import { Router } from 'express';
import { bushaWebhookController } from '../../controllers/webhooks/busha.webhook.controller';

const router = Router();

router.post('/busha', bushaWebhookController);

export default router;

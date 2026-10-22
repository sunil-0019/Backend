import { Router } from 'express';
import { sessionsController } from './controller.js';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import { removeDeviceConfirmSchema } from './schema.js';

const router = Router();
router.use(requireAuth);

router.get('/sessions', sessionsController.listSessions);
router.post('/sessions/remove-all/send-otp', (req, res, next) => { req.params.id = 'remove-all'; next(); }, sessionsController.sendRemoveOtp);
router.get('/sessions/remove-all/status', (req, res, next) => { req.params.id = 'remove-all'; next(); }, sessionsController.getRemoveStatus);
router.post('/sessions/remove-all/confirm', (req, res, next) => { req.params.id = 'remove-all'; next(); }, validate(removeDeviceConfirmSchema), sessionsController.confirmRemove);
router.post('/sessions/:id/remove/send-otp', sessionsController.sendRemoveOtp);
router.get('/sessions/:id/remove/status', sessionsController.getRemoveStatus);
router.post('/sessions/:id/remove/confirm', validate(removeDeviceConfirmSchema), sessionsController.confirmRemove);
router.get('/login-history', sessionsController.getLoginHistory);

export { router as sessionsRoutes };

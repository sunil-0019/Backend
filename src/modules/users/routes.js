import { Router } from 'express';
import { usersController } from './controller.js';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import {
  checkUserIdSchema,
  updateUserIdSchema,
  updateProfileSchema,
} from './schema.js';

const usersRouter = Router();
usersRouter.get('/user-id-available', validate(checkUserIdSchema), usersController.checkAvailability);

const meRouter = Router();
meRouter.use(requireAuth);
meRouter.get('/profile', usersController.getProfile);
meRouter.put('/profile', validate(updateProfileSchema), usersController.updateProfile);
meRouter.patch('/user-id', validate(updateUserIdSchema), usersController.updateUserId);
meRouter.post('/photo', usersController.updatePhoto);
meRouter.delete('/photo', usersController.deletePhoto);
meRouter.delete('/account', usersController.deleteAccount);

export { usersRouter, meRouter };

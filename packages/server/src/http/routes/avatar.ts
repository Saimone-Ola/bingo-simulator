import { Router } from 'express';
import { avatarAppearanceSchema } from '@bingo/shared';
import { AppError } from '../../errors';
import { loadPlayerProfile, saveAvatarAppearance } from '../../services/players';
import { asyncRoute, requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncRoute(async (request, response) => {
    const profile = await loadPlayerProfile(request.auth!.userId);
    if (!profile) throw AppError.notFound('Player profile not found');
    response.json({ appearance: profile.appearance });
  }),
);

router.patch(
  '/',
  asyncRoute(async (request, response) => {
    const parsed = avatarAppearanceSchema.safeParse(request.body);
    if (!parsed.success) {
      throw AppError.validation('Invalid avatar appearance');
    }

    const appearance = await saveAvatarAppearance(request.auth!.userId, parsed.data);
    response.json({ appearance });
  }),
);

export default router;

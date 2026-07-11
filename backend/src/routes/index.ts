import { Router } from 'express';
import healthRoutes from './healthRoutes';
import csvRoutes from './csvRoutes';

const router = Router();

router.use('/', healthRoutes);
router.use('/csv', csvRoutes);

export default router;

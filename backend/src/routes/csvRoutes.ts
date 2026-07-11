import { Router } from 'express';
import { z } from 'zod';
import { upload, validateBody } from '../middleware';
import { uploadCsv } from '../controllers/csvController';
import { extractCsv } from '../controllers/extractionController';

const router = Router();

// ── Validation Schemas ───────────────────────────────────────────────────────

const extractRequestSchema = z.object({
  uploadId: z.string().min(1, 'uploadId is required'),
});

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/csv/upload
 *
 * Multer processes the multipart form, validates file type/size,
 * then the controller handles parsing and session storage.
 */
router.post('/upload', upload.single('file'), uploadCsv);

/**
 * POST /api/csv/extract
 *
 * Validates { uploadId } via Zod, then runs AI extraction against
 * all stored rows and returns structured CRM records.
 */
router.post('/extract', validateBody(extractRequestSchema), extractCsv);

export default router;

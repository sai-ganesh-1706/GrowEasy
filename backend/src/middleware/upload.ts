import multer from 'multer';
import { AppError } from '../types';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIMETYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel', // some browsers/OS report this for .csv
  'text/plain', // fallback — some systems send text/plain for CSV
  'application/octet-stream', // CLI tools (curl, httpie) often default to this
]);

/**
 * Multer instance configured for single-file CSV uploads via memory storage.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // ── Extension check ────────────────────────────────────────────────
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext !== 'csv') {
      return cb(
        new AppError('Invalid file type. Only .csv files are accepted.', 400) as unknown as Error,
      );
    }

    // ── MIME type check ────────────────────────────────────────────────
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      return cb(
        new AppError(
          `Unsupported MIME type "${file.mimetype}". Expected text/csv or equivalent.`,
          400,
        ) as unknown as Error,
      );
    }

    cb(null, true);
  },
});

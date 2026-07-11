import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { parseCsvBuffer } from '../services/csvService';
import { csvSessionStore } from '../services/csvSessionStoreInstance';
import { AppError, CsvUploadResponse, CsvSessionData } from '../types';
import { logger } from '../utils/logger';

const PREVIEW_ROW_COUNT = 20;

/**
 * POST /api/csv/upload
 *
 * Accepts a multipart/form-data CSV file, parses it, stores the parsed
 * data in a short-lived session keyed by uploadId, and returns metadata
 * plus a preview of the first 20 rows.
 */
export async function uploadCsv(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // ── Validate file presence ──────────────────────────────────────────
    if (!req.file) {
      throw new AppError(
        'No file uploaded. Please attach a CSV file under the "file" field.',
        400,
      );
    }

    logger.info('CSV upload received', {
      fileName: req.file.originalname,
      fileSize: req.file.size,
    }, req.requestId);

    // ── Parse CSV ───────────────────────────────────────────────────────
    const { headers, normalizedHeaders, rows, rawRowCount } = parseCsvBuffer(req.file.buffer);

    // ── Store in session ────────────────────────────────────────────────
    const uploadId = uuidv4();

    const sessionData: CsvSessionData = {
      meta: {
        uploadId,
        fileName: req.file.originalname,
        totalRows: rows.length,
        rawRowCount,
        headers,
        normalizedHeaders,
      },
      rows,
    };

    csvSessionStore.set(uploadId, sessionData);

    logger.info('CSV upload processed', {
      uploadId,
      totalRows: rows.length,
      headerCount: headers.length,
    }, uploadId);

    // ── Build response ──────────────────────────────────────────────────
    const response: CsvUploadResponse = {
      ...sessionData.meta,
      preview: rows.slice(0, PREVIEW_ROW_COUNT),
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

import { Request, Response, NextFunction } from 'express';
import { extractAllRows } from '../services/extractionService';
import { logger } from '../utils/logger';

/**
 * POST /api/csv/extract
 *
 * Body is validated by the validateBody middleware in the route definition,
 * so req.body.uploadId is guaranteed to be a valid string at this point.
 */
export async function extractCsv(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { uploadId } = req.body as { uploadId: string };

    logger.info('Extraction requested', { uploadId }, uploadId);

    const result = await extractAllRows(uploadId);

    logger.info('Extraction complete', {
      uploadId,
      totalRows: result.totalRows,
      totalImported: result.totalImported,
      totalSkipped: result.totalSkipped,
    }, uploadId);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

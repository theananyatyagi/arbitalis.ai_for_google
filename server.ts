import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  analyzeArbitrationDocuments,
  askAriaBriefing,
  classifyGeminiError,
  transcribeHearingAudio,
  type UploadedPdfInput,
} from './server/gemini.ts';

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.json({ limit: '4mb' }));

// Lightweight sliding-window rate limiter for AI endpoints (demonstration safety)
const requestBuckets = new Map<string, number[]>();
function rateLimitAi(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 30;
  const recent = (requestBuckets.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= maxRequests) {
    res.status(429).json({
      category: 'RATE_LIMIT',
      message: 'Too many AI requests in one minute. Please wait briefly before retrying.',
      retryable: true,
    });
    return;
  }
  recent.push(now);
  requestBuckets.set(ip, recent);
  next();
}

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 15 * 1024 * 1024, // 15 MB per PDF
  },
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 20 * 1024 * 1024, // 20 MB per audio file
  },
});

app.get('/api/health', (_req, res) => {
  const key = process.env.GEMINI_API_KEY;
  res.json({
    status: 'ok',
    hasApiKey: Boolean(key && key.trim() !== '' && key !== 'MY_GEMINI_API_KEY'),
  });
});

app.post(
  '/api/analyze',
  rateLimitAi,
  (req, res, next) => {
    pdfUpload.array('files', 5)(req, res, (err) => {
      if (err) {
        res.status(400).json({
          category: 'INVALID_DOCUMENT',
          message:
            err instanceof multer.MulterError
              ? `Upload rejected: ${err.message}. Maximum 5 PDFs, 15 MB each.`
              : 'Invalid upload payload.',
          retryable: false,
        });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const controller = new AbortController();
    // Attach abort only to premature response close (never req.on('close'), which fires after multer consumes stream)
    res.on('close', () => {
      if (!res.writableFinished) {
        controller.abort();
      }
    });

    try {
      const files = (req.files as Express.Multer.File[]) || [];

      interface UploadMeta {
        docId: string;
        filename: string;
        category: string;
        hasBinary?: boolean;
        extractedPages?: { pageNumber: number; text: string }[];
      }

      let metaList: UploadMeta[] = [];
      if (typeof req.body.metadata === 'string') {
        try {
          metaList = JSON.parse(req.body.metadata);
        } catch {
          metaList = [];
        }
      }

      if (files.length === 0 && metaList.length === 0) {
        res.status(400).json({
          category: 'INVALID_DOCUMENT',
          message: 'Please attach between 1 and 5 PDF documents to analyze.',
          retryable: false,
        });
        return;
      }

      let fileCursor = 0;
      const docs: UploadedPdfInput[] =
        metaList.length > 0
          ? metaList.map((meta, idx) => {
              const expectsBinary = meta.hasBinary !== false;
              let base64Pdf: string | undefined;
              let filename = meta.filename;
              if (expectsBinary && fileCursor < files.length) {
                const file = files[fileCursor];
                fileCursor += 1;
                const header = file.buffer.subarray(0, 5).toString('ascii');
                const isPdf = file.mimetype === 'application/pdf' || header === '%PDF-';
                if (!isPdf) {
                  throw Object.assign(
                    new Error(`File "${file.originalname}" is not a valid PDF document.`),
                    { category: 'INVALID_DOCUMENT', statusCode: 400 }
                  );
                }
                base64Pdf = file.buffer.toString('base64');
                filename = file.originalname;
              }
              return {
                docId: meta.docId || `DOC-0${idx + 1}`,
                filename,
                category: meta.category || 'Evidence / Exhibit',
                base64Pdf,
                extractedPages: meta.extractedPages,
              };
            })
          : files.map((file, idx) => {
              const header = file.buffer.subarray(0, 5).toString('ascii');
              const isPdf = file.mimetype === 'application/pdf' || header === '%PDF-';
              if (!isPdf) {
                throw Object.assign(
                  new Error(`File "${file.originalname}" is not a valid PDF document.`),
                  { category: 'INVALID_DOCUMENT', statusCode: 400 }
                );
              }
              return {
                docId: `DOC-0${idx + 1}`,
                filename: file.originalname,
                category: 'Evidence / Exhibit',
                base64Pdf: file.buffer.toString('base64'),
              };
            });

      const validDocs = docs.filter(
        (d) => Boolean(d.base64Pdf) || (d.extractedPages && d.extractedPages.length > 0)
      );
      if (validDocs.length === 0) {
        res.status(400).json({
          category: 'INVALID_DOCUMENT',
          message: 'Please attach between 1 and 5 valid PDF documents to analyze.',
          retryable: false,
        });
        return;
      }

      const { analysis, modelUsed } = await analyzeArbitrationDocuments(
        validDocs,
        controller.signal
      );
      res.json({ analysis, model: modelUsed });
    } catch (err) {
      if (controller.signal.aborted && res.writableEnded) return;
      const structured = classifyGeminiError(err);
      res.status(structured.statusCode || 500).json(structured);
    }
  }
);

app.post('/api/aria/briefing', rateLimitAi, async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  try {
    const { question, caseContext, caseTitle, caseOrigin, generateAudio } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      res.status(400).json({
        category: 'INVALID_DOCUMENT',
        message: 'Please enter a question for ARIA.',
        retryable: false,
      });
      return;
    }

    const result = await askAriaBriefing(
      {
        question: question.trim(),
        caseContext: typeof caseContext === 'string' ? caseContext : '',
        caseTitle: typeof caseTitle === 'string' ? caseTitle : 'Active Arbitration Case',
        caseOrigin: caseOrigin === 'demo' ? 'demo' : 'live',
        generateAudio: Boolean(generateAudio),
      },
      controller.signal
    );

    res.json(result);
  } catch (err) {
    if (controller.signal.aborted && res.writableEnded) return;
    const structured = classifyGeminiError(err);
    res.status(structured.statusCode || 500).json(structured);
  }
});

app.post(
  '/api/transcribe',
  rateLimitAi,
  (req, res, next) => {
    audioUpload.single('audio')(req, res, (err) => {
      if (err) {
        res.status(400).json({
          category: 'INVALID_DOCUMENT',
          message:
            err instanceof multer.MulterError
              ? `Audio upload rejected: ${err.message}. Maximum 20 MB.`
              : 'Invalid audio file upload.',
          retryable: false,
        });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          category: 'INVALID_DOCUMENT',
          message: 'Please upload an audio recording (WAV, MP3, WEBM, M4A, or OGG).',
          retryable: false,
        });
        return;
      }

      const baseMime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
      const head = file.buffer.subarray(0, 12);
      let sniffedMime = '';
      if (head.subarray(0, 4).toString('ascii') === 'RIFF') sniffedMime = 'audio/wav';
      else if (head.subarray(0, 4).toString('ascii') === 'OggS') sniffedMime = 'audio/ogg';
      else if (head.subarray(0, 4).toString('ascii') === 'fLaC') sniffedMime = 'audio/flac';
      else if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) sniffedMime = 'audio/webm';
      else if (head.subarray(4, 8).toString('ascii') === 'ftyp') sniffedMime = 'audio/mp4';
      else if (head.subarray(0, 3).toString('ascii') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) sniffedMime = 'audio/mpeg';

      const allowedMime = new Set([
        'audio/wav',
        'audio/x-wav',
        'audio/wave',
        'audio/mpeg',
        'audio/mp3',
        'audio/webm',
        'audio/ogg',
        'audio/mp4',
        'audio/x-m4a',
        'audio/aac',
        'audio/flac',
      ]);
      const normalizedMime =
        baseMime === 'audio/x-wav' || baseMime === 'audio/wave'
          ? 'audio/wav'
          : baseMime === 'audio/x-m4a'
          ? 'audio/mp4'
          : baseMime === 'audio/mp3'
          ? 'audio/mpeg'
          : baseMime;
      const mimeType =
        sniffedMime || (allowedMime.has(baseMime) ? normalizedMime : 'audio/mpeg');
      const title =
        typeof req.body.title === 'string' && req.body.title.trim()
          ? req.body.title.trim()
          : file.originalname;

      const { segments, modelUsed } = await transcribeHearingAudio(
        {
          base64Audio: file.buffer.toString('base64'),
          mimeType,
          title,
        },
        controller.signal
      );

      res.json({
        title,
        filename: file.originalname,
        segments,
        model: modelUsed,
      });
    } catch (err) {
      if (controller.signal.aborted && res.writableEnded) return;
      const structured = classifyGeminiError(err);
      res.status(structured.statusCode || 500).json(structured);
    }
  }
);

app.all('/api/*', (_req, res) => {
  res.status(404).json({
    category: 'UNKNOWN_ERROR',
    message: 'Requested API endpoint does not exist.',
    retryable: false,
    statusCode: 404,
  });
});

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start' ||
    Boolean(process.env.K_SERVICE);

  if (isProduction) {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Arbitalis.AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

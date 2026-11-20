import type { StructuredApiError } from '../types/arbitration';

function isHtmlStartingPage(rawText: string, contentType: string | null): boolean {
  const lower = rawText.trim().toLowerCase();
  return (
    (contentType?.toLowerCase().includes('text/html') ?? false) ||
    lower.startsWith('<!doctype html') ||
    lower.startsWith('<html') ||
    lower.includes('<title>starting server')
  );
}

export async function parseApiResponse<T>(response: Response): Promise<{
  ok: boolean;
  data?: T;
  error?: StructuredApiError;
  isWarmingUp?: boolean;
}> {
  const contentType = response.headers.get('content-type');
  const rawText = await response.text();
  let parsed: unknown = null;

  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  if (response.ok && parsed && typeof parsed === 'object') {
    return { ok: true, data: parsed as T };
  }

  if (parsed && typeof parsed === 'object' && 'message' in parsed && 'category' in parsed) {
    return { ok: false, error: parsed as StructuredApiError };
  }

  if (isHtmlStartingPage(rawText, contentType)) {
    const isStarting = rawText.toLowerCase().includes('starting server');
    return {
      ok: false,
      isWarmingUp: isStarting,
      error: {
        category: 'CAPACITY_ERROR',
        message: isStarting
          ? 'The analysis server is finishing startup. Please wait a moment and click Retry.'
          : `Unexpected HTML response (HTTP ${response.status}). Please retry shortly.`,
        retryable: true,
        statusCode: response.status,
      },
    };
  }

  if (response.status === 503 || response.status === 504 || response.status === 502) {
    return {
      ok: false,
      error: {
        category: 'CAPACITY_ERROR',
        message:
          'The AI analysis server or Gemini model timed out / is temporarily at high capacity (HTTP ' +
          response.status +
          '). Your uploaded data remains preserved — please retry.',
        retryable: true,
        statusCode: response.status,
      },
    };
  }

  return {
    ok: false,
    error: {
      category: 'UNKNOWN_ERROR',
      message: rawText
        ? `Server returned HTTP ${response.status} without valid JSON payload.`
        : `Server returned empty HTTP ${response.status} response.`,
      retryable: response.status >= 500,
      statusCode: response.status,
    },
  };
}

function waitWithSignal(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchApiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxWarmupRetries = 3
): Promise<{ ok: boolean; data?: T; error?: StructuredApiError }> {
  for (let attempt = 0; attempt <= maxWarmupRetries; attempt += 1) {
    const response = await fetch(input, init);
    const parsed = await parseApiResponse<T>(response);

    if (parsed.isWarmingUp && attempt < maxWarmupRetries) {
      await waitWithSignal(2200, init?.signal);
      continue;
    }

    return {
      ok: parsed.ok,
      data: parsed.data,
      error: parsed.error,
    };
  }

  return {
    ok: false,
    error: {
      category: 'CAPACITY_ERROR',
      message: 'The analysis server is still starting up. Please click Retry in a few seconds.',
      retryable: true,
    },
  };
}

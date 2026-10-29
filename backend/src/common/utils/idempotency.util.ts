import { createHash } from 'crypto';
import { ApiErrorCode } from '../errors/api-error-code.enum';
import { LedgeryApiException } from '../errors/ledgery-api.exception';

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9:_.-]+$/;

export function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v.map(canonicalize);
  }
  if (v !== null && typeof v === 'object') {
    return Object.keys(v as object)
      .sort()
      .reduce((acc, k) => {
        const val = (v as any)[k];
        if (val !== undefined) {
          acc[k] = canonicalize(val);
        }
        return acc;
      }, {} as Record<string, unknown>);
  }
  return v;
}

export function payloadHash(dto: Record<string, unknown>): string {
  const { idempotency_key, ...rest } = dto;
  const canonical = canonicalize(rest);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function resolveIdempotencyKey(
  bodyKey?: string | null,
  headerKey?: string | null,
): string | null {
  const normalizedHeader = headerKey ? headerKey.trim() : null;
  const normalizedBody = bodyKey ? bodyKey.trim() : null;

  if (normalizedHeader && normalizedBody && normalizedHeader !== normalizedBody) {
    throw new LedgeryApiException(
      ApiErrorCode.VALIDATION_ERROR,
      'Nilai idempotency_key pada body dan header Idempotency-Key tidak cocok.',
      400,
      { headerKey: normalizedHeader, bodyKey: normalizedBody },
    );
  }

  const key = normalizedHeader || normalizedBody;
  if (!key) {
    return null;
  }

  if (key.length < 1 || key.length > 128 || !IDEMPOTENCY_KEY_REGEX.test(key)) {
    throw new LedgeryApiException(
      ApiErrorCode.VALIDATION_ERROR,
      'Format idempotency_key tidak valid. Harus berupa 1-128 karakter (huruf, angka, titik, strip, underscore, titik dua).',
      400,
      { idempotency_key: key },
    );
  }

  return key;
}


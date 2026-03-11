import { ValidationError } from './errors';

/**
 * validates that every field in `fields` is present and non-empty in `data`.
 * accepts any object via the `unknown` param; casts internally to a record.
 *
 * @throws ValidationError if a required field is missing, null, or blank
 */
export function validateRequired(data: unknown, fields: string[]): void {
  const record = data as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      throw new ValidationError(`missing required field: ${field}`);
    }
  }
}

/**
 * validates that `url` is a valid absolute http or https url.
 *
 * @throws ValidationError if the url is malformed or uses a non-http/https scheme
 */
export function validateUrl(url: string, fieldName: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError(`invalid url in field "${fieldName}": ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError(
      `field "${fieldName}" must be an http or https url, got scheme "${parsed.protocol}"`,
    );
  }
}

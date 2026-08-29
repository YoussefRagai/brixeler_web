const SECRET_PATTERNS = [
  /(?:access|refresh|id)[_-]?token\s*[:=]\s*[^\s,;]+/gi,
  /bearer\s+[^\s,;]+/gi,
  /[?&](?:code|token|key|secret)=[^&#\s]+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
];

function redact(value: string) {
  return SECRET_PATTERNS.reduce((sanitized, pattern) => sanitized.replace(pattern, '[redacted]'), value);
}

export function captureOperationalError(error: unknown, context: string) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected error';
  console.error('[operational-error]', {
    context: context.slice(0, 100),
    name: error instanceof Error ? error.name : 'Error',
    message: redact(message).slice(0, 500),
  });
}

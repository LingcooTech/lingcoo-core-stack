import type { FastifyRequest } from 'fastify';
const sensitive =
  /password|secret|token|authorization|cookie|credential|private.?key|api.?key|smtp|certificate|(^|_)(text|html|body|payload|error|stack|message)($|_)/i;
export function redactAuditValue(value: unknown, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  if (depth > 5) return { truncated: true };
  const output: Record<string, unknown> = {};
  let size = 0;
  for (const [key, entry] of Object.entries(value).slice(0, 50)) {
    if (sensitive.test(key)) output[key] = '[REDACTED]';
    else if (Array.isArray(entry))
      output[key] = entry
        .slice(0, 20)
        .map((item) =>
          typeof item === 'object'
            ? redactAuditValue(item, depth + 1)
            : typeof item === 'string'
              ? item.slice(0, 200)
              : item,
        );
    else if (entry && typeof entry === 'object') output[key] = redactAuditValue(entry, depth + 1);
    else output[key] = typeof entry === 'string' ? entry.slice(0, 200) : entry;
    size += Buffer.byteLength(JSON.stringify(output[key] ?? null));
    if (size > 8192) {
      output[key] = '[TRUNCATED]';
      output.truncated = true;
      break;
    }
  }
  return output;
}
export function auditContext(request: FastifyRequest) {
  return {
    actorType: 'user' as const,
    actorUserId: request.user.sub,
    requestId: request.id,
    ipAddress: request.ip,
    userAgent:
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
  };
}

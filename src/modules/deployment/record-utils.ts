export function normalizeDeploymentMeta(meta: unknown) {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? { ...(meta as Record<string, unknown>) }
    : {};
}

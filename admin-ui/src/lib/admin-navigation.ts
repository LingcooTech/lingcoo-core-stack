/** Accept only local admin destinations; settings must not return to itself. */
export function adminReturnPath(value: string | null): string | undefined {
  if (!value?.startsWith('/admin/') || value.includes('\\')) return undefined;
  const url = new URL(value, 'https://admin.invalid');
  if (
    url.origin !== 'https://admin.invalid' ||
    !url.pathname.startsWith('/admin/') ||
    url.pathname.replace(/\/$/, '') === '/admin/settings'
  )
    return undefined;
  return url.pathname + url.search + url.hash;
}

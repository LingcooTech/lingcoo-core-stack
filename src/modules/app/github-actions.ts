import { z } from 'zod';
import { gitSourceSchema } from '@lingcoo/contracts';
import { httpError } from '../../lib/errors';

export const workflowRunSchema = z.object({
  id: z.number().int(),
  head_sha: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  html_url: z.url(),
  created_at: z.string(),
  display_title: z.string(),
});
export class GitHubActionsClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private prefix(repository: string) {
    gitSourceSchema.shape.repository.parse(repository);
    const [owner, name] = repository
      .replace(/\/$/, '')
      .replace(/\.git$/, '')
      .split('/')
      .slice(-2);
    return `/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(name!)}/actions`;
  }
  private async request(path: string, body?: unknown) {
    let response: Response;
    try {
      response = await this.fetcher('https://api.github.com' + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
    } catch {
      throw httpError(502, 'GitHub Actions request failed');
    }
    if (!response.ok)
      throw httpError(
        response.status >= 500 ? 502 : 422,
        `GitHub Actions returned ${response.status}; check workflow_dispatch and Actions permissions`,
      );
    if (response.status === 204) return null;
    if (Number(response.headers.get('content-length') ?? 0) > 2000000)
      throw httpError(422, 'GitHub Actions response exceeds limit');
    const reader = response.body?.getReader();
    if (!reader) throw httpError(502, 'Empty GitHub Actions response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2000000) {
          await reader.cancel();
          throw httpError(422, 'GitHub Actions response exceeds limit');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw httpError(502, 'Invalid GitHub Actions response');
    }
  }
  async runs(repository: string, workflow: string) {
    if (!/^[A-Za-z0-9_.-]+\.ya?ml$/.test(workflow))
      throw httpError(422, 'Invalid workflow filename');
    const value = await this.request(
      `${this.prefix(repository)}/workflows/${encodeURIComponent(workflow)}/runs?per_page=30`,
    );
    return z.object({ workflow_runs: z.array(workflowRunSchema) }).parse(value).workflow_runs;
  }
  async dispatch(
    repository: string,
    workflow: string,
    ref: string,
    inputs: { stack_build_id: string; stack_commit: string; stack_version: string },
  ) {
    if (!this.token) throw httpError(422, 'A GitHub Actions write connection is required');
    if (!/^[A-Za-z0-9_.-]+\.ya?ml$/.test(workflow))
      throw httpError(422, 'Invalid workflow filename');
    await this.request(
      `${this.prefix(repository)}/workflows/${encodeURIComponent(workflow)}/dispatches`,
      { ref, inputs },
    );
  }
}

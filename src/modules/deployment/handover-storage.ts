import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { mkdir, open, unlink, statfs, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { httpError } from '../../lib/errors';
export const HANDOVER_MAX_BYTES = 1024 * 1024 * 1024;
export class HandoverStorage {
  constructor(private readonly root: string) {}
  private path(id: string) {
    return join(this.root, z.uuid().parse(id) + '.age');
  }
  async capacity(required: number) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const stat = await statfs(this.root);
    if (stat.bavail * stat.bsize < required + 512 * 1024 * 1024)
      throw httpError(409, '交付存储空间不足');
  }
  async write(id: string, offset: number, data: Buffer) {
    const path = this.path(id);
    let f;
    try {
      f = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      const s = await f.stat();
      if (s.size < offset) throw httpError(409, '上传文件已丢失，请重新制作交付包');
      await f.truncate(offset);
      let written = 0;
      while (written < data.length) {
        const result = await f.write(data, written, data.length - written, offset + written);
        if (!result.bytesWritten) throw httpError(500, '交付包写入失败');
        written += result.bytesWritten;
      }
      await f.sync();
    } finally {
      await f?.close();
    }
  }
  async verify(id: string, size: number, sha: string) {
    const s = await lstat(this.path(id));
    if (!s.isFile() || s.isSymbolicLink() || s.size !== size)
      throw httpError(409, '交付包长度不匹配');
    const h = createHash('sha256');
    for await (const b of createReadStream(this.path(id))) h.update(b);
    if (h.digest('hex') !== sha) throw httpError(409, '交付包校验失败');
  }
  async stream(id: string) {
    const f = await open(this.path(id), constants.O_RDONLY | constants.O_NOFOLLOW);
    return f.createReadStream();
  }
  async remove(id: string) {
    await unlink(this.path(id)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
}

import { constants } from 'node:fs';
import { access, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

// The root is deployment configuration, never a browser-supplied path.
export class LocalStorageProvider {
  constructor(private readonly root: string) {}
  private async path(key: string, create = false) {
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(key))
      throw new Error('无效的本地存储对象路径');
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const root = await realpath(this.root);
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) throw new Error('本地存储对象越界');
    let directory = root;
    for (const segment of key.split('/').slice(0, -1)) {
      directory = resolve(directory, segment);
      if (create)
        await mkdir(directory, { mode: 0o700 }).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        });
      if ((await realpath(directory)) !== directory) throw new Error('本地存储不允许符号链接');
    }
    return path;
  }
  async test() {
    const key = `connection-test/${randomUUID()}`;
    const path = await this.path(key, true);
    const file = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile('storage connection test');
    } finally {
      await file.close();
      await unlink(path);
    }
    await access(this.root, constants.R_OK | constants.W_OK);
  }
  async write(key: string, body: Buffer) {
    const file = await open(
      await this.path(key, true),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(body);
    } finally {
      await file.close();
    }
  }
  async read(key: string) {
    const file = await open(await this.path(key), constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await file.stat()).isFile()) {
      await file.close();
      throw new Error('本地存储对象不是文件');
    }
    return { Body: file.createReadStream({ autoClose: true }) };
  }
  async delete(key: string) {
    try {
      await unlink(await this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

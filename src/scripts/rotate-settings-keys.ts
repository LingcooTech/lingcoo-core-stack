import { createDatabase } from '../composition/connections';
import { loadEnv } from '../lib/env';
import { rotateSettingKeys } from '../composition/settings-key-rotation';
async function main() {
  const env = loadEnv();
  const { db, pool } = createDatabase(env);
  try {
    console.info(await rotateSettingKeys(db, env, !process.argv.includes('--apply')));
  } finally {
    await pool.end();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error('Settings rotation failed; transaction rolled back');
    process.exitCode = 1;
  });

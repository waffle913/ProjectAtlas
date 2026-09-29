import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'src/simulation/__tests__/socioeconomicWorld.test.ts', '--reporter=verbose'], {
  stdio: 'inherit', env: { ...process.env, WRITE_SOCIOECONOMIC_REPORT: process.argv.includes('--write') ? '1' : '0' },
});
process.exit(result.status ?? 1);

// Сборка сервера в server/dist. Зависимости из package.json остаются внешними,
// а @zg/shared (исходники на TS) вшивается в бандл.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@zg/shared');
const buildId = process.env.BUILD_ID ?? 'local';

await build({
  entryPoints: {
    index: 'src/index.ts',
    migrate: 'src/db/migrate.ts',
    setup: 'src/cli/setup.ts',
    invite: 'src/cli/invite.ts',
    seed: 'src/cli/seed.ts',
    maps: 'src/cli/maps.ts',
    backup: 'src/cli/backup.ts',
  },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  splitting: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external,
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  logLevel: 'info',
});

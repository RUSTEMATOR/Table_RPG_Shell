// npm run dev: сервер (127.0.0.1:3001, dev-база) и Vite (5173, доступен в локальной сети).
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const env = {
  ...process.env,
  ZG_ENV_FILE: process.env.ZG_ENV_FILE ?? join(homedir(), '.config/zelenogorye/.env.development'),
};

const procs = ['server', 'web'].map((ws) => {
  const p = spawn('npm', ['run', 'dev', '-w', ws], { stdio: 'inherit', env });
  p.on('exit', (code) => {
    console.log(`[${ws}] завершился с кодом ${code}`);
    for (const other of procs) if (other !== p) other.kill('SIGTERM');
    process.exit(code ?? 0);
  });
  return p;
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => procs.forEach((p) => p.kill(sig)));

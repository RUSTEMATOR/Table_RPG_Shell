import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Ввод без эха — для пароля мастера. */
export async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WritableStream };
  let muted = false;
  out._writeToOutput = (s: string) => {
    if (!muted) stdout.write(s);
  };
  const pending = rl.question(question);
  muted = true;
  try {
    return await pending;
  } finally {
    muted = false;
    stdout.write('\n');
    rl.close();
  }
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

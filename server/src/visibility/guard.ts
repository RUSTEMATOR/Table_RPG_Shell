// Предохранитель последней линии: всё, что уходит игроку или столу,
// проверяется на маркер тестовых секретов и на мастерские ключи.
// Сработал — значит, где-то обойдён visibility/*. Это дефект, а не норма.

export const GM_MARKER = 'СЕКРЕТ-МАСТЕРА';

const GM_KEY_PATTERNS = [/"gm_[A-Za-z0-9_]*"\s*:/, /"[A-Za-z0-9_]*_gm"\s*:/, /"gm[A-Z][A-Za-z0-9]*"\s*:/, /"[A-Za-z0-9]+Gm"\s*:/];

export function findGmLeak(serialized: string): string | null {
  if (serialized.includes(GM_MARKER)) return 'marker';
  for (const re of GM_KEY_PATTERNS) {
    const m = re.exec(serialized);
    if (m) return `key ${m[0]}`;
  }
  return null;
}

export class GmLeakError extends Error {
  constructor(
    readonly where: string,
    readonly reason: string,
  ) {
    super(`Утечка мастерских данных заблокирована: ${where}: ${reason}`);
  }
}

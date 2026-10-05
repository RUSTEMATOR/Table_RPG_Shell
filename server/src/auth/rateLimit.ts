// Скользящее окно в памяти. Процесс один, этого достаточно.
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private fresh(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Сколько секунд ждать, или 0, если можно. */
  blockedFor(key: string, now = Date.now()): number {
    const list = this.fresh(key, now);
    if (list.length < this.limit) return 0;
    return Math.ceil((this.windowMs - (now - list[0]!)) / 1000);
  }

  hit(key: string, now = Date.now()): void {
    const list = this.fresh(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

const FIFTEEN_MIN = 15 * 60 * 1000;
// Неудачные попытки на участника: защищает PIN от перебора.
export const memberFailures = new RateLimiter(5, FIFTEEN_MIN);
// Все попытки с одного IP: за столом и у мобильных операторов IP общий, поэтому лимит широкий.
export const ipAttempts = new RateLimiter(50, FIFTEEN_MIN);

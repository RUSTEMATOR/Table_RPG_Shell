// localStorage только для удобства: может быть недоступен, тогда просто молчим.
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

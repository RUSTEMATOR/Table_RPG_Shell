// Диктовка (этап 56): Web Speech API браузера, русский. Звук распознаёт браузер — Chrome отправляет его Google,
// Safari — Apple; поэтому для записей «Только мне» диктовка не предлагается (решает вызывающий).

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const dictationSupported = (): boolean => typeof window !== 'undefined' && ctor() !== null;

export interface Dictation {
  stop: () => void;
}

/** Начать диктовку: onFinal — готовые фразы (дописать в поле), onInterim — то, что ещё распознаётся. */
export function startDictation(h: { onFinal: (text: string) => void; onInterim: (text: string) => void; onEnd: () => void; onError: (code: string) => void }): Dictation | null {
  const C = ctor();
  if (!C) return null;
  const r = new C();
  r.lang = 'ru-RU';
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      const t = res[0].transcript;
      if (res.isFinal) h.onFinal(t.trim());
      else interim += t;
    }
    h.onInterim(interim.trim());
  };
  r.onerror = (e) => h.onError(e.error);
  r.onend = () => h.onEnd();
  try {
    r.start();
  } catch {
    return null;
  }
  return { stop: () => r.stop() };
}

/** Дописать фразу к тексту: пробел между, первая буква заглавная после точки или в начале. */
export function appendPhrase(text: string, phrase: string): string {
  if (!phrase) return text;
  const base = text.replace(/\s+$/, '');
  const capital = !base || /[.!?…]$/.test(base);
  const p = capital ? phrase[0]!.toUpperCase() + phrase.slice(1) : phrase;
  return base ? `${base} ${p}` : p;
}

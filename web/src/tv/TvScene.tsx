import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { TableScene } from '@zg/shared';
import { cn } from '../lib/cn.ts';

/** Картинка готова к показу без рывка: загружена и раскодирована. Ошибка — показываем как есть. */
function decoded(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => undefined);
}

const same = (a: TableScene | null, b: TableScene | null) => (a?.image?.url ?? '') === (b?.image?.url ?? '');

/**
 * Сцена на столе: фон и подпись. Новая картинка показывается только после decode(), старая и новая плавно
 * перетекают (два слоя на время смены). Медленный наплыв (Ken Burns) — если движение не выключено.
 * Пустой стол — заставка «Зеленогорье» (если нет и противника).
 */
export function TvScene({ scene, motion, idle }: { scene: TableScene | null; motion: boolean; idle: boolean }) {
  const [shown, setShown] = useState<TableScene | null>(scene);
  useEffect(() => {
    let alive = true;
    if (!scene?.image || same(scene, shown)) setShown(scene);
    else void decoded(scene.image.url).then(() => alive && setShown(scene));
    return () => {
      alive = false;
    };
  }, [scene]); // shown — только для сравнения, при её смене перезапускать загрузку не нужно

  return (
    <>
      <AnimatePresence initial={false}>
        <m.div
          key={shown?.image?.url ?? 'none'}
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeInOut' }}
        >
          {shown?.image ? (
            <img
              src={shown.image.url}
              alt=""
              width={shown.image.w}
              height={shown.image.h}
              className={cn('size-full object-cover', motion && 'animate-[zg-kenburns_40s_ease-in-out_infinite_alternate] motion-reduce:animate-none')}
            />
          ) : (
            <div className="size-full bg-[radial-gradient(ellipse_60%_55%_at_30%_70%,rgba(130,140,128,.3),transparent_70%),radial-gradient(ellipse_45%_40%_at_75%_35%,rgba(160,170,158,.18),transparent_70%),linear-gradient(170deg,#3a463c_0%,#1a201b_55%,#0d0f0d_100%)]" />
          )}
        </m.div>
      </AnimatePresence>
      {/* затемнение снизу и сверху: текст читается на любой картинке */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,rgba(13,15,13,.9),rgba(13,15,13,0)_55%),linear-gradient(to_bottom,rgba(13,15,13,.6),rgba(13,15,13,0)_25%)]"
      />

      <AnimatePresence mode="wait">
        <m.section
          key={shown ? `${shown.id}:${shown.title}:${shown.text}` : idle ? 'idle' : 'empty'}
          className="absolute bottom-[7vh] left-[5vw] grid max-w-[min(52vw,1000px)] gap-[1.2vh] portrait:right-[5vw] portrait:max-w-none"
          initial="hide"
          animate="show"
          exit="hide"
          variants={{ show: { transition: { staggerChildren: 0.18, delayChildren: 0.5 } }, hide: { opacity: 0, transition: { duration: 0.35 } } }}
        >
          {shown ? (
            <>
              <Line>
                <span className="text-[clamp(14px,1.15vw,24px)] tracking-[.08em] text-[var(--tv-muted)] uppercase">Сцена</span>
              </Line>
              {shown.title && (
                <Line>
                  <h1 className="m-0 font-['Oranienbaum',Georgia,serif] text-[clamp(44px,4.6vw,96px)] leading-[1.05] font-normal [text-shadow:0_2px_24px_rgba(0,0,0,.6)]">
                    {shown.title}
                  </h1>
                </Line>
              )}
              {shown.text && (
                <Line>
                  <p className="prewrap m-0 font-read text-[clamp(18px,1.5vw,30px)] leading-[1.4] text-[var(--tv-soft)] [text-shadow:0_1px_12px_rgba(0,0,0,.7)]">{shown.text}</p>
                </Line>
              )}
            </>
          ) : (
            idle && (
              <Line>
                <h1 className="m-0 font-['Oranienbaum',Georgia,serif] text-[clamp(44px,4.6vw,96px)] font-normal text-[var(--tv-muted)]">Зеленогорье</h1>
              </Line>
            )
          )}
        </m.section>
      </AnimatePresence>
    </>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <m.div variants={{ hide: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 20 } } }}>{children}</m.div>;
}

import { AnimatePresence, m } from 'motion/react';
import type { TableNpc } from '@zg/shared';

/** Портрет противника на столе: проявляется из полосы по центру (clip-path), имя крупно следом. Только имя и картинка. */
export function TvNpc({ npc }: { npc: TableNpc | null }) {
  return (
    <AnimatePresence>
      {npc && (
        <m.figure
          key={`${npc.name}:${npc.image?.url ?? ''}`}
          className="absolute top-[13vh] left-[5vw] m-0 grid justify-items-start gap-[1.5vh]"
          initial="hide"
          animate="show"
          exit="hide"
        >
          {npc.image && (
            <m.img
              src={npc.image.url}
              alt=""
              width={npc.image.w}
              height={npc.image.h}
              className="aspect-[4/5] h-[min(50vh,560px)] w-auto rounded-[14px] object-cover shadow-[0_30px_60px_rgba(0,0,0,.5)]"
              variants={{
                hide: { clipPath: 'inset(48% 0% 48% 0% round 14px)', opacity: 0, filter: 'brightness(2)' },
                show: { clipPath: 'inset(0% 0% 0% 0% round 14px)', opacity: 1, filter: 'brightness(1)', transition: { duration: 1.1, ease: [0.2, 0.7, 0.2, 1] } },
              }}
            />
          )}
          <m.figcaption
            className="font-['Oranienbaum',Georgia,serif] text-[clamp(32px,3.4vw,72px)] leading-none [text-shadow:0_2px_24px_rgba(0,0,0,.6)]"
            variants={{
              hide: { opacity: 0, y: 20, letterSpacing: '0.12em' },
              show: { opacity: 1, y: 0, letterSpacing: '0em', transition: { delay: npc.image ? 0.6 : 0, duration: 0.9, ease: 'easeOut' } },
            }}
          >
            {npc.name}
          </m.figcaption>
        </m.figure>
      )}
    </AnimatePresence>
  );
}

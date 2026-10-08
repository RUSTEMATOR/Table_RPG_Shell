import { useEffect, useState } from 'react';
import type { ImagePublic } from '@zg/shared';
import { thumbHashToDataURL } from 'thumbhash';
import { cn } from '../lib/cn.ts';

// Картинка с плейсхолдером (этап 40): под <img> — размытый thumbhash (приходит вместе с картинкой, ~28 байт),
// сам файл проявляется после загрузки. size 'thumb' — превью до 480 px (списки, маленькие рамки), 'full' — полный файл.
// Превью старых картинок может ещё не быть (404, пока сервер досчитывает) — тогда берётся полный файл.

const dataUrls = new Map<string, string>();

/** thumbhash (base64) → data:URL маленькой размытой картинки; кэш на сессию. */
export function hashUrl(hash: string | null): string | undefined {
  if (!hash) return undefined;
  const have = dataUrls.get(hash);
  if (have) return have;
  try {
    const u = thumbHashToDataURL(Uint8Array.from(atob(hash), (c) => c.charCodeAt(0)));
    dataUrls.set(hash, u);
    return u;
  } catch {
    return undefined;
  }
}

export function Pic({
  image,
  size = 'full',
  className,
  imgClassName = 'size-full object-cover',
  loading,
}: {
  image: ImagePublic;
  size?: 'thumb' | 'full';
  className?: string;
  imgClassName?: string;
  loading?: 'lazy' | 'eager';
}) {
  const want = size === 'thumb' ? image.thumb : image.url;
  const [src, setSrc] = useState(want);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSrc(want);
    setReady(false);
  }, [want]);
  const bg = hashUrl(image.hash);
  return (
    <span className={cn('block overflow-hidden bg-cover bg-center', className)} style={bg ? { backgroundImage: `url(${bg})` } : undefined}>
      <img
        src={src}
        alt=""
        width={image.w}
        height={image.h}
        loading={loading}
        decoding="async"
        onLoad={() => setReady(true)}
        onError={() => {
          if (src !== image.url) setSrc(image.url);
        }}
        className={cn(imgClassName, 'transition-opacity duration-300', ready ? 'opacity-100' : 'opacity-0')}
      />
    </span>
  );
}

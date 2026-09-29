'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * The reader's photo filling the avatar circle, or `fallback` (their initials)
 * when there is no photo or it will not load — a Google picture URL can
 * expire, and a network can block the storage host.
 */
export function AvatarPhoto({ src, fallback }: { src: string | null | undefined; fallback: ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [src]);
  if (!src || failed === src) return <>{fallback}</>;
  return (
    // A plain <img>: the photo is already a small square, sized for this circle.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setFailed(src)}
      className="h-full w-full rounded-full object-cover"
    />
  );
}

import { useState } from 'react';
import { getInitials } from '@/lib/utils';

/** Keep the brand footprint stable when a configured remote logo cannot load. */
export function BrandMark({ src, name }: { src?: string | null; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src && src !== failedSrc);
  return (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-sm font-semibold text-foreground"
      aria-hidden="true"
    >
      {getInitials(name)}
      {showImage && (
        <img
          src={src!}
          alt=""
          width={36}
          height={36}
          onError={() => setFailedSrc(src!)}
          className="absolute inset-0 h-full w-full bg-card object-contain p-1"
        />
      )}
    </span>
  );
}

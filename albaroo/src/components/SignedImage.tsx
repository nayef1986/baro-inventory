'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

export function SignedImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photos/signed-url?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.url) setUrl(data.url);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) return <div className={clsx('animate-pulse bg-black/5 dark:bg-white/5', className)} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

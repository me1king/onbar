'use client';

import * as React from 'react';
import Image, { type ImageProps } from 'next/image';

export default function DecodedImage({ onLoad, onError, ...props }: ImageProps) {
  const [decoded, setDecoded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setDecoded(false);
    setFailed(false);
  }, [props.src]);

  const handleLoad: NonNullable<ImageProps['onLoad']> = async event => {
    const image = event.currentTarget;
    onLoad?.(event);
    try {
      await image.decode();
      setDecoded(true);
    } catch {
      if (image.naturalWidth > 0) setDecoded(true);
      else setFailed(true);
    }
  };

  const handleError: NonNullable<ImageProps['onError']> = event => {
    onError?.(event);
    setFailed(true);
  };

  return (
    <>
      {!decoded && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-[1] bg-slate-100 ${failed ? '' : 'motion-safe:animate-pulse'}`}
        />
      )}
      {!failed && (
        <Image
          {...props}
          alt={props.alt}
          onLoad={handleLoad}
          onError={handleError}
          data-decoded={decoded ? 'true' : 'false'}
          className={`decoded-image ${props.className || ''}`}
        />
      )}
    </>
  );
}

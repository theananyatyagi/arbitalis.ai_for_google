import React, { useState } from 'react';

interface BrandLogoProps {
  /** Height utility classes for the visible wordmark (width follows the aspect ratio). */
  className?: string;
}

/**
 * Official transparent Arbitalis.AI wordmark (public/assets/arbitalis-logo.png, 1600x533 RGBA).
 * The source file has wide transparent margins, so we crop to the wordmark with CSS only;
 * the asset itself is untouched.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ className = 'h-9 sm:h-10' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <span className="font-serif text-xl font-semibold tracking-tight text-[#231612]">
        arbitalis.ai
      </span>
    );
  }

  return (
    <span
      className={`relative block overflow-hidden ${className}`}
      style={{ aspectRatio: '4.65 / 1' }}
    >
      <img
        src="/assets/arbitalis-logo.png"
        alt="Arbitalis.AI"
        onError={() => setImgFailed(true)}
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ width: '135%', left: '-18.1%', top: '-54.9%' }}
      />
    </span>
  );
};

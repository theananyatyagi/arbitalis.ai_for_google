import React, { useState } from 'react';

interface BrandLogoProps {
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = 'h-8 sm:h-9 w-auto object-contain',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <span className="font-serif text-xl font-semibold tracking-tight text-[#231612]">
        arbitalis.ai
      </span>
    );
  }

  return (
    <img
      src="/assets/aistudio/arbitalis-ai-logo_d7601a28.jpg"
      alt="Arbitalis.AI"
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`${className} mix-blend-multiply`}
    />
  );
};

import React from 'react';

export default function ComicBadge({
  children,
  variant = 'magenta',
  className = ''
}) {
  const variants = {
    magenta: 'bg-accent text-white border-black',
    yellow: 'bg-primary text-primary-foreground border-black',
    cyan: 'bg-info text-black border-black',
    orange: 'bg-exit text-white border-black',
    outline: 'bg-surface-2 text-text-muted border-border'
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-comic px-3 py-1 text-sm tracking-wider uppercase border-2 shadow-[2px_2px_0_#000] rounded-full select-none ${variants[variant] || variants.magenta} ${className}`}
    >
      {children}
    </span>
  );
}


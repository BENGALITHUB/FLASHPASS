import React from 'react';

export default function ComicCard({
  children,
  className = '',
  color = 'default',
  ...props
}) {
  const borderColors = {
    default: 'border-border',
    yellow: 'border-primary',
    magenta: 'border-accent',
    cyan: 'border-info'
  };

  return (
    <div
      className={`bg-surface border-2 ${borderColors[color] || borderColors.default} shadow-[4px_4px_0_#000] rounded-2xl p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}


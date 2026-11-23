import React from 'react';

export default function ComicButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  ...props
}) {
  const baseStyles = 'min-w-0 max-w-full inline-flex items-center justify-center gap-1 leading-tight text-center font-comic tracking-wider border-2 border-black select-none transition-all duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] [&>svg]:shrink-0';

  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary-dark shadow-[4px_4px_0_#000]',
    accent: 'bg-accent text-white hover:bg-accent-hover shadow-[4px_4px_0_#000]',
    info: 'bg-info text-black hover:brightness-110 shadow-[4px_4px_0_#000]',
    success: 'bg-success text-white hover:brightness-110 shadow-[4px_4px_0_#000]',
    outline: 'bg-surface text-text hover:bg-surface-2 border-border shadow-[4px_4px_0_#000]',
    danger: 'bg-danger text-white hover:brightness-110 shadow-[4px_4px_0_#000]'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-base rounded-lg',
    md: 'px-5 py-2.5 text-lg rounded-xl',
    lg: 'px-4 sm:px-6 py-3 sm:py-3.5 text-xl sm:text-2xl rounded-2xl w-full min-h-[52px] sm:min-h-[56px]'
  };

  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${disabledStyles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}


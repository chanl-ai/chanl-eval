import { cn } from '@/lib/utils';

interface ChanlLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

/**
 * Chanl mark + wordmark (from chanl-admin). Uses currentColor for theme awareness.
 */
export function ChanlLogo({
  size = 32,
  showText = true,
  className,
  iconClassName,
  textClassName,
}: ChanlLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('shrink-0', iconClassName)}
        aria-hidden
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <g transform="rotate(-90 12 12)">
          <path d="M5.636 5.636a9 9 0 1 0 12.728 12.728a9 9 0 0 0 -12.728 -12.728z" />
          <path d="M16.243 7.757a6 6 0 0 0 -8.486 0" />
        </g>
      </svg>
      {showText && (
        <span
          className={cn('font-semibold tracking-tight text-foreground', textClassName)}
          style={{ fontSize: size * 0.55 }}
        >
          Chanl
        </span>
      )}
    </div>
  );
}

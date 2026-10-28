import { LOGO_PATH } from '@/lib/logo-path';

export function LogoMark({ size = 22 }: { size?: number }) {
  const height = Math.round(size * 0.6);
  const width = Math.round(height * 3.061);
  return (
    <svg
      viewBox="0 0 512.8 167.5"
      width={width}
      height={height}
      className="logo-mark"
      role="img"
      aria-label="WorkLab XC logo"
    >
      <path d={LOGO_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

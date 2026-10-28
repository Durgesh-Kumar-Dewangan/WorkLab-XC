import type { SVGProps } from 'react';
import clsx from 'clsx';
import { ICON_PATHS, type IconName } from '@/lib/icon-paths';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName | (string & {});
  size?: number;
}

export function Icon({ name, size = 18, className, ...rest }: Props) {
  const inner = (ICON_PATHS as Record<string, string>)[name] ?? ICON_PATHS.box;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={clsx(className)}
      dangerouslySetInnerHTML={{ __html: inner }}
      {...rest}
    />
  );
}

export const Spinner = ({ size = 14 }: { size?: number }) => (
  <Icon name="refresh" size={size} className="spin" />
);

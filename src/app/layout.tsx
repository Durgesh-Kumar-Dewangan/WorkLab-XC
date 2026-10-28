import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/jetbrains-mono';
import '@/styles/10-tokens.css';
import '@/styles/20-base.css';
import '@/styles/30-site.css';
import '@/styles/40-auth.css';
import '@/styles/50-app.css';
import '@/styles/60-classroom.css';
import '@/styles/70-site-extended.css';
import '@/styles/80-product.css';
import '@/styles/90-responsive.css';
import '@/styles/95-scenic.css';
import '@/styles/96-os-themes.css';
import '@/styles/96-playful.css';
import '@/styles/96-themes.css';
import '@/styles/97-sheet.css';
import '@/styles/98-studio.css';
import '@/styles/99-admin.css';
import '@/styles/99-canvas.css';
import '@/styles/99-classroom-compact.css';
import '@/styles/99-custom.css';
import '@/styles/99-lesson.css';
import '@/styles/99-livemap.css';
import '@/styles/99-path.css';
import '@/styles/99-phone.css';
import '@/styles/99-play.css';
import '@/styles/99-scrollbar.css';
import '@/styles/99-study.css';
import { AppProviders } from '@/components/providers/AppProviders';

export const metadata: Metadata = {
  title: { default: 'WorkLab XC', template: '%s · WorkLab XC' },
  description: 'Turn a course outline into lessons you can follow.',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

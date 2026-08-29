import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3001'),
  title: '样格｜公众号视觉模板提取',
  description: '从公众号文章中提取字体、颜色、间距与组件，生成可复用的微信排版模板。',
  openGraph: {
    title: '样格｜公众号视觉模板提取',
    description: '把好排版变成可复用资产。',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '样格｜公众号视觉模板提取',
    description: '把好排版变成可复用资产。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

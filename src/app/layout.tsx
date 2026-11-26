import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '등기로 — 등기부등본 공유·열람 & 변동 알림',
  description: '공유된 부동산 등기부등본 PDF를 바로 확인하고, 관심 물건의 등기변동을 알림으로 받아보세요.',
  icons: {
    icon: [
      { url: '/assets/images/favicon-light.png?v=2', media: '(prefers-color-scheme: light)' },
      { url: '/assets/images/favicon-dark.png?v=2', media: '(prefers-color-scheme: dark)' },
      { url: '/assets/images/favicon-light.png?v=2' },
    ],
    apple: '/assets/images/favicon-dark.png?v=2',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

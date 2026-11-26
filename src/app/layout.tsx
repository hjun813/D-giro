import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '등기로 — 지도에서 등기 찾기',
  description: '지도에서 등기 자료 조회와 변동 알림을 제공하는 등기로',
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

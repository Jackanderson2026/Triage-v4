import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sessions Triage',
  description: 'Partner triage queue and offboarding-risk monitor for Sessions account managers.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

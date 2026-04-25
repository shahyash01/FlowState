import './globals.css';

export const metadata = {
  title: 'FlowState — Stadium Intelligence Platform',
  description: 'Real-time crowd flow management, digital twin, and AI-powered stadium operations.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import './globals.css'

export const metadata = {
  title: 'FlowState — Smart Stadium Operations',
  description: 'Smart Stadium Experience Platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}

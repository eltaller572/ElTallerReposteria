import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'El Taller Repostería & Coffee Bar',
  description:
    'El Taller Repostería & Coffee Bar — pasteles personalizados bajo pedido, pan y galletas recién horneados, café y bowls. Plaza Pascal. Cotiza por WhatsApp.',
  openGraph: {
    title: 'El Taller Repostería & Coffee Bar',
    description:
      'Pasteles personalizados bajo pedido, pan y galletas recién horneados, café y bowls. Cotiza por WhatsApp.',
    locale: 'es_MX',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

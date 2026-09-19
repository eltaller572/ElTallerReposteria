/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        // ⚠️ Cuando tengamos la Project URL real de Supabase, se reemplaza
        // el patrón de abajo por el subdominio real, ej:
        // hostname: 'xxxxxxxx.supabase.co',
        hostname: '*.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;

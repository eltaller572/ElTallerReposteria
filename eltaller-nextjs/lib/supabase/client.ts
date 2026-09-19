import { createBrowserClient } from '@supabase/ssr';

// Cliente de Supabase para usar en componentes del navegador (páginas públicas,
// formularios, el personalizador, etc). Usa SOLO la llave pública "anon" —
// nunca la "service_role" va aquí.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

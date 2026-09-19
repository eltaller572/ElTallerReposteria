import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers';

// Cliente de Supabase para usar en páginas/componentes del servidor
// (ej. leer el stock del día antes de mandar la página al navegador).
// También usa la llave pública "anon".
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Se puede ignorar si se llama desde un Server Component:
            // el middleware se encarga de refrescar la sesión.
          }
        },
      },
    }
  );
}

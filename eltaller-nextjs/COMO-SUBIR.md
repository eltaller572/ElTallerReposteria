# Cómo subir esto a GitHub

Esta es la base real del proyecto (Next.js) — la estructura de carpetas que
Vercel necesita para poder construir el sitio de verdad. Por ahora la página
de inicio es solo una prueba de que todo está conectado; el diseño completo
del demo se va portando en las próximas sesiones.

## Subir los archivos

1. Entra a tu repositorio: `github.com/eltaller572/ElTallerReposteria`
2. Clic en **Add file** → **Upload files**
3. Arrastra la carpeta `eltaller-nextjs` completa (o todos sus archivos y
   subcarpetas) a la zona de carga — Chrome mantiene la estructura de
   carpetas al arrastrar
4. Abajo, en "Commit changes", puedes dejar el mensaje por default
5. Clic en **Commit changes**

**Importante:** el archivo `.env.example` SÍ se sube (es solo una plantilla,
sin valores reales). El archivo `.env.local` (que crearás después, con los
valores reales) **nunca** se sube — por eso ya está en `.gitignore`.

## Después de subir

Vercel va a detectar el cambio en automático y va a intentar construir el
sitio. La primera vez probablemente falle o pida las variables de entorno —
eso es justo lo que vamos a resolver en cuanto Supabase esté reactivado:

1. En Vercel → tu proyecto → **Settings** → **Environment Variables**
2. Agregar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   con los valores reales que copiaste de Supabase
3. Agregar `NEXT_PUBLIC_WHATSAPP_NUMBER` con el valor `527551712674`
4. Volver a la pestaña **Deployments** y darle **Redeploy** al último

Con eso, el sitio (aunque sea solo la página de prueba por ahora) debería
quedar publicado de verdad en `el-taller-reposteria.vercel.app`.

## Qué sigue después de esto

- Portar el diseño completo del demo (home, pasteles, stock del día,
  personalizador) a componentes reales de Next.js, conectados a las
  tablas de Supabase en vez de datos escritos a mano
- Construir `/admin/dashboard` y `/admin/stock` (la página de login ya
  redirige ahí según el rol, pero esas páginas todavía no existen)
- Middleware que proteja todo `/admin/*`

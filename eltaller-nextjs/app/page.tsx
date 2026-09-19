export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
        textAlign: 'center',
        padding: '24px',
      }}
    >
      <h1 style={{ color: 'var(--rojo)', fontSize: '36px' }}>
        El Taller Repostería
      </h1>
      <p style={{ color: 'var(--gris)', maxWidth: '440px' }}>
        Proyecto real conectado — GitHub → Vercel → Supabase. Esta página
        de inicio se va a reemplazar por el diseño completo ya aprobado
        en el demo, sección por sección, en las próximas sesiones.
      </p>
    </main>
  );
}

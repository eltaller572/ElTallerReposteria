'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: correo,
      password,
    });

    if (authError) {
      // Mensaje genérico a propósito: no revelar si el correo existe o no
      // (evita que alguien use el login para enumerar cuentas válidas).
      setError('Correo o contraseña incorrectos.');
      setCargando(false);
      return;
    }

    // Verificamos que tenga un perfil activo antes de dejarlo pasar.
    // RLS ya protege la tabla, esto es además una validación explícita
    // en el cliente para dar buen feedback de inmediato.
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('rol, activo')
      .eq('id', data.user.id)
      .single();

    if (!perfil || !perfil.activo) {
      await supabase.auth.signOut();
      setError('Esta cuenta no tiene acceso activo al panel.');
      setCargando(false);
      return;
    }

    // Dueño y developer van al dashboard completo; trabajador va directo
    // al apartado de stock del día (no ve ventas ni finanzas).
    if (perfil.rol === 'trabajador') {
      router.push('/admin/stock');
    } else {
      router.push('/admin/dashboard');
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--crema)',
        padding: '24px',
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          background: '#fff',
          border: '2px solid var(--borde)',
          padding: '32px',
          width: '100%',
          maxWidth: '380px',
        }}
      >
        <h1 style={{ fontSize: '22px', color: 'var(--rojo)', marginBottom: '24px' }}>
          El Taller — Panel
        </h1>

        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
          Correo
        </label>
        <input
          type="email"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            border: '2px solid var(--borde)',
            marginBottom: '16px',
          }}
        />

        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
          Contraseña
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            border: '2px solid var(--borde)',
            marginBottom: '20px',
          }}
        />

        {error && (
          <p style={{ color: 'var(--rojo)', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--rojo)',
            color: '#fff',
            border: '2px solid var(--borde)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}
        >
          {cargando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}

/*
  Pendiente para la siguiente sesión (no bloquea esta):
  - middleware.ts que proteja /admin/* completo (redirigir a /admin/login
    si no hay sesión válida, en vez de confiar solo en esta página).
  - Rate limiting en el login (varios intentos fallidos → bloqueo temporal).
  - /admin/dashboard y /admin/stock (las páginas a las que redirige esto).
*/

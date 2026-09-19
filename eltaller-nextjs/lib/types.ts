// Tipos que reflejan exactamente las tablas creadas en
// schema-supabase-el-taller.sql. Si el esquema cambia, actualizar aquí también.

export type RolUsuario = 'dueno' | 'trabajador' | 'developer';

export interface Perfil {
  id: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  created_at: string;
}

export interface StockProducto {
  id: string;
  categoria: 'Pan' | 'Galletas' | 'Bebidas y Bowls';
  subcategoria: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  precio_grande: number | null;
  badge: string | null;
  imagen_url: string | null;
  disponible: number | null; // null = "siempre disponible"
  activo: boolean;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pastel {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  bizcocho: string | null;
  relleno: string | null;
  cobertura: string | null;
  imagen_url: string | null;
  badge: string | null;
  activo: boolean;
  created_at: string;
}

export interface Cotizacion {
  id: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  pastel_base: string | null;
  bizcocho: string | null;
  relleno: string | null;
  cobertura: string | null;
  tamano: string | null;
  decoracion: string | null;
  color: string | null;
  extras: string[] | null;
  precio_estimado_min: number | null;
  precio_estimado_max: number | null;
  fecha_entrega: string | null;
  hora_entrega: string | null;
  comentarios: string | null;
  imagen_referencia_url: string | null;
  estado: 'nueva' | 'confirmada' | 'en_proceso' | 'entregada' | 'cancelada';
  created_at: string;
}

export interface Apartado {
  id: string;
  producto_id: string | null;
  producto_nombre: string;
  precio: number | null;
  cliente_telefono: string | null;
  estado: string;
  created_at: string;
}

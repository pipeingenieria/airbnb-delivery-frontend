// src/app/models/admin.models.ts

export interface Categoria {
  id?: number;
  nombre: string;
  requiere_despacho: boolean;
}

export interface Zona {
  id?: number;
  nombre: string;
  ciudad: string;
  activo: boolean;
}

export interface Aliado {
  id?: number;
  nombre: string;
  direccion?: string;
  latitud?: number;
  longitud?: number;
  categoria_id: number | null;
  zona_id: number | null;
  estado_operativo: string;
  qr_access_token?: string;
  correo_contacto?: string;
  nombre_contacto?: string; // <-- AÑADIR
  telefono_contacto?: string;
  logo_url?: string;
  pedidos_activos?: number;
}

export interface Zona {
  id?: number;
  nombre: string;
  ciudad: string;
  activo: boolean;
  latitud?: number;
  longitud?: number;
  radio?: number; // <-- Nuevo: Radio de la zona en metros
}

export interface Propiedad {
  id?: number;
  nombre: string;
  direccion_apto?: string;
  activo?: boolean;
  latitud?: number;
  longitud?: number;
  zonas_ids?: number[];
  qr_access_token?: string;
  airbnb_nombre?: string;
  airbnb_telefono?: string;
  airbnb_correo?: string;
  imagen_url?: string | null; // <--- ESTA ES LA LÍNEA QUE FALTA
}

// Interfaz para la creación en lote (Edificios)
export interface PropiedadBatchCreate {
  nombre_edificio: string;
  latitud: number;
  longitud: number;
  apartamentos: string[];
  zonas_ids: number[];
}

export interface Categoria {
  id?: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  activo: boolean;
  requiere_despacho: boolean;
}

export interface ItemCarrito {
  item_id: number;
  cantidad: number;
  notas_personalizadas?: string; // Opcional
}

export interface CheckoutRequest {
  propiedad_id: number;
  aliado_id: number;
  huesped_nombre: string;
  huesped_contacto: string; // Puede ser el correo o teléfono
  items: ItemCarrito[];
}
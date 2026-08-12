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

export interface Propiedad {
  id?: number;
  nombre: string;
  direccion_apto?: string;
  zona_id: number;
  qr_access_token?: string;
  activo: boolean;
}

export interface Aliado {
  id?: number;
  nombre: string;
  categoria_id: number;
  zona_id: number;
  estado_operativo: string;
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
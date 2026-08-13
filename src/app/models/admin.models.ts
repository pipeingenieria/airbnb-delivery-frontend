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

export interface Propiedad {
  id?: number;
  nombre: string;
  direccion_apto?: string;
  activo?: boolean;
  latitud?: number;
  longitud?: number;
  zonas_ids?: number[];
  qr_access_token?: string;
}

// Interfaz para la creación en lote (Edificios)
export interface PropiedadBatchCreate {
  nombre_edificio: string;
  latitud: number;
  longitud: number;
  apartamentos: string[];
  zonas_ids: number[];
}
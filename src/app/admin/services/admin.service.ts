import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Zona, Categoria, Propiedad, Aliado } from '../../models/admin.models';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private http = inject(HttpClient);
  
  // URL base apuntando a tu servidor local de FastAPI
  private apiUrl = 'http://127.0.0.1:8000/api/v1/core';

  // ==========================================
  // ZONAS (Edificios)
  // ==========================================
  getZonas(): Observable<Zona[]> {
    return this.http.get<Zona[]>(`${this.apiUrl}/zonas`);
  }
  createZona(zona: Zona): Observable<Zona> {
    return this.http.post<Zona>(`${this.apiUrl}/zonas`, zona);
  }

  // ==========================================
  // CATEGORÍAS
  // ==========================================
  getCategorias(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(`${this.apiUrl}/categorias`);
  }
  createCategoria(categoria: Categoria): Observable<Categoria> {
    return this.http.post<Categoria>(`${this.apiUrl}/categorias`, categoria);
  }

  // ==========================================
  // PROPIEDADES (Apartamentos)
  // ==========================================
  getPropiedades(): Observable<Propiedad[]> {
    return this.http.get<Propiedad[]>(`${this.apiUrl}/propiedades`);
  }
  createPropiedad(propiedad: Propiedad): Observable<Propiedad> {
    return this.http.post<Propiedad>(`${this.apiUrl}/propiedades`, propiedad);
  }

  // ==========================================
  // ALIADOS (Restaurantes)
  // ==========================================
  getAliados(): Observable<Aliado[]> {
    return this.http.get<Aliado[]>(`${this.apiUrl}/aliados`);
  }
  createAliado(aliado: Aliado): Observable<Aliado> {
    return this.http.post<Aliado>(`${this.apiUrl}/aliados`, aliado);
  }
}
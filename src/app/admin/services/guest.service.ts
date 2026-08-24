import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Zona, Categoria, Propiedad, Aliado, PropiedadBatchCreate, CheckoutRequest } from '../../models/admin.models';

@Injectable({
  providedIn: 'root'
})
export class GuestService {
  private http = inject(HttpClient);
  
  // URL base apuntando a tu servidor local de FastAPI
  //private apiUrl = 'http://127.0.0.1:8000/api/v1/core';
  private apiUrl = environment.apiUrl;

  // ==========================================
  // GUEST VIEW (Huéspedes)
  // ==========================================
  getGuestPropertyData(token: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/guest/property/${token}`);
  }
  
  getGuestCatalog(aliadoId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/guest/ally/${aliadoId}/catalog`);
  }
  
  // Asumiendo que environment.apiUrl es 'https://airbnb-delivery-api.fly.dev/api/v1'
  // Si en tu env incluye '/core', usa replace o ten una baseUrl general
  private apiBaseUrl = environment.apiUrl.replace('/core', ''); 

  // ... (tus métodos existentes de getGuestPropertyData, etc.) ...

  // === NUEVO: CHECKOUT Y PAGOS ===
  crearPreferenciaPago(data: CheckoutRequest): Observable<{ok: boolean, init_point: string, pedido_id: number}> {
    return this.http.post<any>(`${this.apiBaseUrl}/checkout/crear-preferencia`, data);
  }

  checkOrderStatus(pedidoId: string) {
    return this.http.get(`${this.apiUrl}/checkout/status/${pedidoId}`);
  }
}
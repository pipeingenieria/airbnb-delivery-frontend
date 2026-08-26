import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment'; // Ajusta tu ruta[cite: 20]

@Component({
  selector: 'app-aliado-pedidos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './aliado-pedidos.html',
  styleUrls: ['./aliado-pedidos.scss'] 
})
export class AliadoPedidosComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);

  isDarkMode = signal<boolean>(true);
  pedidosActivos = signal<any[]>([]);
  cargando = signal<boolean>(true);
  
  private token: string = '';
  private pollingInterval: any;

  // --- NUEVAS SEÑALES PARA EL DASHBOARD HISTÓRICO ---
  modalHistorialAbierto = signal<boolean>(false);
  historialPedidos = signal<any[]>([]);
  cargandoHistorial = signal<boolean>(false);

  // Calculadora automática de métricas para el Dashboard
  metricas = computed(() => {
    const pedidos = this.historialPedidos();
    const entregados = pedidos.filter(p => p.estado_operativo === 'Entregado');
    const rechazados = pedidos.filter(p => p.estado_operativo === 'Rechazado' || p.estado_operativo === 'Cancelado');
    const ingresos = entregados.reduce((acc, p) => acc + (p.monto_total || 0), 0);

    return {
      total: pedidos.length,
      entregados: entregados.length,
      rechazados: rechazados.length,
      ingresos: ingresos,
      tasaRechazo: pedidos.length ? Math.round((rechazados.length / pedidos.length) * 100) : 0
    };
  });

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      this.token = params.get('token') || '';
      if (this.token) {
        this.cargarPedidos();
        this.iniciarAutoRecarga();
      }
    });
  }

  ngOnDestroy() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
  }

  toggleTheme() { this.isDarkMode.set(!this.isDarkMode()); }

  volverAlCatalogo() { this.router.navigate(['/aliado', this.token]); }

  cargarPedidos() {
    this.http.get(`${environment.apiUrl}/partner/live-orders/${this.token}`).subscribe({
      next: (res: any) => {
        if (res.ok) this.pedidosActivos.set(res.pedidos);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }

  iniciarAutoRecarga() {
    this.pollingInterval = setInterval(() => { this.cargarPedidos(); }, 15000);
  }

  cambiarEstado(pedidoId: number, nuevoEstado: string) {
    this.http.patch(`${environment.apiUrl}/partner/order/${pedidoId}/status`, { estado: nuevoEstado })
      .subscribe((res: any) => {
        if (res.ok) {
          if (nuevoEstado === 'Entregado') {
            this.pedidosActivos.update(list => list.filter(p => p.id !== pedidoId));
          } else {
            this.cargarPedidos();
          }
        }
      });
  }

  // --- LÓGICA DEL DASHBOARD HISTÓRICO ---
  abrirHistorial() {
    this.modalHistorialAbierto.set(true);
    this.cargandoHistorial.set(true);
    
    // Llamada 100% real a la base de datos
    this.http.get(`${environment.apiUrl}/partner/history-orders/${this.token}`).subscribe({
      next: (res: any) => {
        if (res.ok) {
          this.historialPedidos.set(res.pedidos);
        }
        this.cargandoHistorial.set(false);
      },
      error: () => {
        // Si hay error en la red, dejamos el historial vacío
        this.historialPedidos.set([]);
        this.cargandoHistorial.set(false);
      }
    });
  }

  cerrarHistorial() { this.modalHistorialAbierto.set(false); }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price);
  }
}
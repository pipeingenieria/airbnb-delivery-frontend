import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms'; 
import { environment } from '../../../../../environments/environment'; 

@Component({
  selector: 'app-aliado-pedidos',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  // --- LÓGICA DEL DASHBOARD HISTÓRICO ULTRA-PRO ---
  modalHistorialAbierto = signal<boolean>(false);
  historialPedidos = signal<any[]>([]);
  cargandoHistorial = signal<boolean>(false);

  // Filtros interactivos (Estilo BotCompany)
  filtroTexto = signal<string>('');
  filtroEstado = signal<string>('Todos');

  // 1. Filtrado en tiempo real
  pedidosFiltrados = computed(() => {
    let filtrados = this.historialPedidos();
    const estado = this.filtroEstado();
    const texto = this.filtroTexto().toLowerCase().trim();

    // Filtro por píldoras de estado
    if (estado === 'Completados') filtrados = filtrados.filter(p => p.estado_operativo === 'Entregado');
    else if (estado === 'Pendientes') filtrados = filtrados.filter(p => ['En Camino', 'Aprobado - Por Preparar', 'Pendiente Pago'].includes(p.estado_operativo));
    else if (estado === 'Rechazados') filtrados = filtrados.filter(p => ['Rechazado', 'Cancelado'].includes(p.estado_operativo));

    // Filtro de búsqueda (ID, Apartamento o Nombre de Producto)
    if (texto) {
      filtrados = filtrados.filter(p => 
        p.id.toString().includes(texto) ||
        (p.propiedad?.nombre || '').toLowerCase().includes(texto) ||
        (p.detalles || []).some((d: any) => (d.item?.nombre || '').toLowerCase().includes(texto))
      );
    }
    return filtrados;
  });

  // 2. Calculadora de KPIs dinámicos
  metricas = computed(() => {
    const pedidos = this.pedidosFiltrados();
    const entregados = pedidos.filter(p => p.estado_operativo === 'Entregado');
    const rechazadosArray = pedidos.filter(p => ['Rechazado', 'Cancelado'].includes(p.estado_operativo)); // Capturamos los rechazados
    const ingresos = entregados.reduce((acc, p) => acc + (p.monto_total || 0), 0);
    
    // Extracción de Top Productos
    const conteoProductos: { [key: string]: { cantidad: number, ingresos: number } } = {};
    entregados.forEach(p => {
      (p.detalles || []).forEach((d: any) => {
        const nombre = d.item?.nombre || 'Producto Desconocido';
        if (!conteoProductos[nombre]) conteoProductos[nombre] = { cantidad: 0, ingresos: 0 };
        conteoProductos[nombre].cantidad += d.cantidad;
        conteoProductos[nombre].ingresos += (d.precio_unitario * d.cantidad);
      });
    });

    const topProductos = Object.entries(conteoProductos)
      .map(([nombre, datos]) => ({ nombre, ...datos }))
      .sort((a, b) => b.ingresos - a.ingresos)
      .slice(0, 5);

    const maxIngresoProducto = topProductos.length ? topProductos[0].ingresos : 1;

    return {
      total: pedidos.length,
      entregados: entregados.length, // Usamos 'entregados' para que haga match con el HTML
      rechazados: rechazadosArray.length, // Devolvemos el conteo crudo
      ingresos: ingresos,
      ticketPromedio: entregados.length ? ingresos / entregados.length : 0,
      tasaRechazo: pedidos.length ? Math.round((rechazadosArray.length / pedidos.length) * 100) : 0,
      topProductos,
      maxIngresoProducto
    };
  });
  
  abrirHistorial() {
    this.modalHistorialAbierto.set(true);
    this.cargandoHistorial.set(true);
    this.filtroEstado.set('Todos');
    this.filtroTexto.set('');
    
    this.http.get(`${environment.apiUrl}/partner/history-orders/${this.token}`).subscribe({
      next: (res: any) => {
        if (res.ok) this.historialPedidos.set(res.pedidos);
        this.cargandoHistorial.set(false);
      },
      error: () => { this.historialPedidos.set([]); this.cargandoHistorial.set(false); }
    });
  }

  cerrarHistorial() { this.modalHistorialAbierto.set(false); }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price);
  }
}
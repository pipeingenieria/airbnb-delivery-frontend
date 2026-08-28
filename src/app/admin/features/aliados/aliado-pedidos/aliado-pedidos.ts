import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms'; 
import Chart from 'chart.js/auto'; // <-- Añade esta línea EN LOS IMPORTS HASTA ARRIBA DEL ARCHIVO
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

  // Filtros Avanzados
  filtroTexto = signal<string>('');
  filtroEstado = signal<string>('Todos');
  fechaInicio = signal<string>('');
  fechaFin = signal<string>('');
  
  graficoVentas: any;

  pedidosFiltrados = computed(() => {
    let filtrados = this.historialPedidos();
    const estado = this.filtroEstado();
    const texto = this.filtroTexto().toLowerCase().trim();
    const inicio = this.fechaInicio() ? new Date(this.fechaInicio()).getTime() : null;
    const fin = this.fechaFin() ? new Date(this.fechaFin()).getTime() + 86399000 : null; // Fin del día

    // 1. Filtro de Fechas
    if (inicio || fin) {
      filtrados = filtrados.filter(p => {
        const fechaPedido = new Date(p.creado_en).getTime();
        if (inicio && fechaPedido < inicio) return false;
        if (fin && fechaPedido > fin) return false;
        return true;
      });
    }

    // 2. Filtro de Estados
    if (estado === 'Completados') filtrados = filtrados.filter(p => p.estado_operativo === 'Entregado');
    else if (estado === 'Pendientes') filtrados = filtrados.filter(p => ['En Camino', 'Aprobado - Por Preparar', 'Pendiente Pago', 'Creado'].includes(p.estado_operativo));
    else if (estado === 'Rechazados') filtrados = filtrados.filter(p => ['Rechazado', 'Cancelado'].includes(p.estado_operativo));

    // 3. Filtro de Búsqueda (Incluye MercadoPago ID)
    if (texto) {
      filtrados = filtrados.filter(p => 
        p.id.toString().includes(texto) ||
        (p.liquidacion?.gateway_tx_id || '').toLowerCase().includes(texto) ||
        (p.propiedad?.nombre || '').toLowerCase().includes(texto) ||
        (p.detalles || []).some((d: any) => (d.item?.nombre || '').toLowerCase().includes(texto))
      );
    }
    
    // Disparamos la actualización del gráfico cada vez que cambian los filtros
    setTimeout(() => this.actualizarGrafico(filtrados), 50);
    return filtrados;
  });

  metricas = computed(() => {
    const pedidos = this.pedidosFiltrados();
    
    // CORRECCIÓN: "Aprobado", "En Camino" y "Entregado" YA son plata en caja.
    const estadosExitosos = ['Aprobado - Por Preparar', 'En Camino', 'Entregado'];
    const exitosos = pedidos.filter(p => estadosExitosos.includes(p.estado_operativo));
    const rechazadosArray = pedidos.filter(p => ['Rechazado', 'Cancelado'].includes(p.estado_operativo));
    
    const ingresos = exitosos.reduce((acc, p) => acc + (p.monto_total || 0), 0);
    
    // Top Productos
    const conteoProductos: { [key: string]: { cantidad: number, ingresos: number } } = {};
    exitosos.forEach(p => {
      (p.detalles || []).forEach((d: any) => {
        const nombre = d.item?.nombre || 'Producto Desconocido';
        if (!conteoProductos[nombre]) conteoProductos[nombre] = { cantidad: 0, ingresos: 0 };
        conteoProductos[nombre].cantidad += d.cantidad;
        conteoProductos[nombre].ingresos += (d.precio_unitario * d.cantidad);
      });
    });

    const topProductos = Object.entries(conteoProductos)
      .map(([nombre, datos]) => ({ nombre, ...datos }))
      .sort((a, b) => b.ingresos - a.ingresos).slice(0, 5);

    return {
      total: pedidos.length,
      entregados: exitosos.length, // Ventas reales confirmadas
      rechazados: rechazadosArray.length,
      ingresos: ingresos,
      ticketPromedio: exitosos.length ? ingresos / exitosos.length : 0,
      tasaRechazo: pedidos.length ? Math.round((rechazadosArray.length / pedidos.length) * 100) : 0,
      topProductos,
      maxIngresoProducto: topProductos.length ? topProductos[0].ingresos : 1
    };
  });

  actualizarGrafico(pedidos: any[]) {
    if (!document.getElementById('ventasChart')) return;
    
    const exitosos = pedidos.filter(p => ['Aprobado - Por Preparar', 'En Camino', 'Entregado'].includes(p.estado_operativo));
    
    // Agrupar ventas por día
    const ventasPorDia: any = {};
    exitosos.forEach(p => {
      const fecha = new Date(p.creado_en).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
      ventasPorDia[fecha] = (ventasPorDia[fecha] || 0) + p.monto_total;
    });

    const labels = Object.keys(ventasPorDia).reverse();
    const data = Object.values(ventasPorDia).reverse();

    if (this.graficoVentas) this.graficoVentas.destroy();

    const ctx = document.getElementById('ventasChart') as HTMLCanvasElement;
    this.graficoVentas = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ingresos ($)',
          data: data,
          borderColor: '#4F46E5', // Indigo 600
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: this.isDarkMode() ? '#1e293b' : '#f1f5f9' } }, x: { grid: { display: false } } }
      }
    });
  }

  abrirHistorial() {
    this.modalHistorialAbierto.set(true);
    this.cargandoHistorial.set(true);
    this.filtroEstado.set('Todos');
    this.filtroTexto.set('');
    this.fechaInicio.set('');
    this.fechaFin.set('');
    
    this.http.get(`${environment.apiUrl}/partner/history-orders/${this.token}`).subscribe({
      next: (res: any) => {
        if (res.ok) {
          this.historialPedidos.set(res.pedidos);
          setTimeout(() => this.actualizarGrafico(res.pedidos), 100); // Dibuja la gráfica al cargar
        }
        this.cargandoHistorial.set(false);
      },
      error: () => { this.historialPedidos.set([]); this.cargandoHistorial.set(false); }
    });
  }

  cerrarHistorial() { this.modalHistorialAbierto.set(false); }

  formatPrice(price: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price); }
}
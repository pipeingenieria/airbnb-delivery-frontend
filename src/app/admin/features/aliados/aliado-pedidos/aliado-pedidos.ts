import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../../environments/environment';
import Chart from 'chart.js/auto';
import flatpickr from 'flatpickr';

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

  // --- CONTROL DE LA ANIMACIÓN DE DESPACHO ---
  animacionDespacho = signal<boolean>(false);
  pedidoEnDespacho = signal<number | null>(null);

  // --- CONTROL DEL MODAL DE CONFIRMACIÓN ---
  pedidoAConfirmar = signal<any>(null);
  estadoAConfirmar = signal<string>('');

  abrirConfirmacion(pedido: any, estado: string) {
    this.pedidoAConfirmar.set(pedido);
    this.estadoAConfirmar.set(estado);
  }

  cerrarConfirmacion() {
    this.pedidoAConfirmar.set(null);
    this.estadoAConfirmar.set('');
  }

  ejecutarConfirmacion() {
    const pedido = this.pedidoAConfirmar();
    const estado = this.estadoAConfirmar();
    
    // Cerramos el modal de seguridad inmediatamente
    this.cerrarConfirmacion();
    
    // Disparamos la acción real (que incluye la animación de la moto)
    if (pedido && estado) {
      this.cambiarEstado(pedido.id, estado);
    }
  }
  
  private token: string = '';
  private pollingInterval: any;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      this.token = params.get('token') || '';
      if (this.token) { this.cargarPedidos(); this.iniciarAutoRecarga(); }
    });
  }
  ngOnDestroy() { if (this.pollingInterval) clearInterval(this.pollingInterval); }
  toggleTheme() { this.isDarkMode.set(!this.isDarkMode()); }
  volverAlCatalogo() { this.router.navigate(['/aliado', this.token]); }
  
  cargarPedidos() {
    this.http.get(`${environment.apiUrl}/partner/live-orders/${this.token}`).subscribe({
      next: (res: any) => { if (res.ok) this.pedidosActivos.set(res.pedidos); this.cargando.set(false); },
      error: () => this.cargando.set(false)
    });
  }
  iniciarAutoRecarga() { this.pollingInterval = setInterval(() => { this.cargarPedidos(); }, 15000); }
  cambiarEstado(pedidoId: number, nuevoEstado: string) {
    // 1. Activamos la UI de despacho
    this.pedidoEnDespacho.set(pedidoId);
    this.animacionDespacho.set(true);

    // 2. Ejecutamos la orden en el servidor
    this.http.patch(`${environment.apiUrl}/partner/order/${pedidoId}/status`, { estado: nuevoEstado })
      .subscribe({
        next: (res: any) => {
          // 3. Dejamos que la moto cruce la pantalla (2.5 segundos)
          setTimeout(() => {
            this.animacionDespacho.set(false);
            this.pedidoEnDespacho.set(null);
            
            if (res.ok) {
              // ¡Adiós pedido! Ya está en manos del domiciliario.
              // Lo removemos del tablero de la cocina.
              this.pedidosActivos.update(list => list.filter(p => p.id !== pedidoId));
            }
          }, 2500);
        },
        error: () => {
          this.animacionDespacho.set(false);
          this.pedidoEnDespacho.set(null);
        }
      });
  }

  // =========================================================
  // DASHBOARD HISTÓRICO ULTRA-PRO
  // =========================================================
  modalHistorialAbierto = signal<boolean>(false);
  historialPedidos = signal<any[]>([]);
  cargandoHistorial = signal<boolean>(false);

  filtroTexto = signal<string>('');
  filtroEstado = signal<string>('Todos');
  fechaInicio = signal<string>('');
  fechaFin = signal<string>('');
  // --- NUEVAS SEÑALES DE PAGINACIÓN ---
  paginaActual = signal<number>(1);
  itemsPorPagina = signal<number>(10);

  // --- CONVERSIÓN DE MONEDA ULTRA-PRO ---
  mostrarEnDolares = signal<boolean>(false);
  
  // TODO: Fácil de reemplazar. Solo tienes que hacer un fetch a un API gratuito 
  // (ej: api.exchangerate-api.com) en el ngOnInit y actualizar este valor.
  tasaCambioCopAUsd = 4200.0; 

  toggleMoneda() {
    this.mostrarEnDolares.set(!this.mostrarEnDolares());
    // Refrescamos las gráficas para que cambien de COP a USD dinámicamente
    this.actualizarGraficos(this.pedidosFiltrados());
  }

  // Rebanamos los datos filtrados para mostrar solo los de la página actual
  pedidosPaginados = computed(() => {
    const filtrados = this.pedidosFiltrados();
    const inicio = (this.paginaActual() - 1) * this.itemsPorPagina();
    return filtrados.slice(inicio, inicio + this.itemsPorPagina());
  });

  totalPaginas = computed(() => {
    return Math.ceil(this.pedidosFiltrados().length / this.itemsPorPagina()) || 1;
  });

  cambiarPagina(delta: number) {
    const nueva = this.paginaActual() + delta;
    if (nueva >= 1 && nueva <= this.totalPaginas()) this.paginaActual.set(nueva);
  }

  cambiarItemsPorPagina(e: any) {
    this.itemsPorPagina.set(Number(e.target.value));
    this.paginaActual.set(1);
  }
  
  graficoVentas: any;
  graficoEstados: any;
  graficoTop: any;
  datePickerInstance: any;

  pedidosFiltrados = computed(() => {
    let filtrados = this.historialPedidos();
    const estado = this.filtroEstado();
    const texto = this.filtroTexto().toLowerCase().trim();
    const inicio = this.fechaInicio() ? new Date(this.fechaInicio()).getTime() : null;
    const fin = this.fechaFin() ? new Date(this.fechaFin()).getTime() + 86399000 : null; 

    // 1. Filtro de Fechas
    if (inicio || fin) {
      filtrados = filtrados.filter(p => {
        const fechaPedido = new Date(p.creado_en).getTime();
        if (inicio && fechaPedido < inicio) return false;
        if (fin && fechaPedido > fin) return false;
        return true;
      });
    }

    // 2. Filtro de Estados (CORREGIDO PARA LOGÍSTICA KDS)
    if (estado === 'Completados') filtrados = filtrados.filter(p => p.estado_operativo === 'Entregado');
    else if (estado === 'Urgentes (Cocina)') filtrados = filtrados.filter(p => ['Aprobado - Por Preparar', 'En Camino'].includes(p.estado_operativo));
    else if (estado === 'Pendientes (Pago)') filtrados = filtrados.filter(p => ['Pendiente Pago', 'Pendiente', 'Creado'].includes(p.estado_operativo));
    else if (estado === 'Rechazados') filtrados = filtrados.filter(p => ['Rechazado', 'Cancelado'].includes(p.estado_operativo));

    // 3. Filtro de Búsqueda
    if (texto) {
      filtrados = filtrados.filter(p => 
        p.id.toString().includes(texto) ||
        (p.liquidacion?.gateway_tx_id || '').toLowerCase().includes(texto) ||
        (p.propiedad?.nombre || '').toLowerCase().includes(texto) ||
        (p.propiedad?.direccion_apto || '').toLowerCase().includes(texto) ||
        (p.detalles || []).some((d: any) => (d.item?.nombre || '').toLowerCase().includes(texto))
      );
    }
    
    setTimeout(() => this.actualizarGraficos(filtrados), 50);
    return filtrados;
  });

  metricas = computed(() => {
    const pedidos = this.pedidosFiltrados();
    const estadosExitosos = ['Aprobado - Por Preparar', 'En Camino', 'Entregado'];
    const exitosos = pedidos.filter(p => estadosExitosos.includes(p.estado_operativo));
    const rechazadosArray = pedidos.filter(p => ['Rechazado', 'Cancelado'].includes(p.estado_operativo));
    const ingresos = exitosos.reduce((acc, p) => acc + (p.monto_total || 0), 0);
    
    return {
      total: pedidos.length,
      entregados: exitosos.length, 
      rechazados: rechazadosArray.length,
      ingresos: ingresos,
      ticketPromedio: exitosos.length ? ingresos / exitosos.length : 0,
      tasaRechazo: pedidos.length ? Math.round((rechazadosArray.length / pedidos.length) * 100) : 0,
    };
  });

  // NUEVO: Función para calcular el tiempo real transcurrido (Edad del pedido)
  getTiempoTranscurrido(fechaStr: string): string {
    if (!fechaStr) return '--';
    const diffMs = new Date().getTime() - new Date(fechaStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHrs = Math.floor(diffMins / 60);
    return `Hace ${diffHrs}h ${diffMins % 60}m`;
  }

  actualizarGraficos(pedidos: any[]) {
    if (!document.getElementById('ventasChart')) return;
    const isDark = this.isDarkMode();
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#1e293b' : '#f1f5f9';
    const borderColor = isDark ? '#0b1120' : '#ffffff';

    // Divisor dinámico según la moneda seleccionada
    const divisorMoneda = this.mostrarEnDolares() ? this.tasaCambioCopAUsd : 1;

    // 1. DATA LÍNEAS
    const exitosos = pedidos.filter(p => ['Aprobado - Por Preparar', 'En Camino', 'Entregado'].includes(p.estado_operativo));
    const ventasPorDia: any = {};
    exitosos.forEach(p => {
      const fecha = new Date(p.creado_en).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
      ventasPorDia[fecha] = (ventasPorDia[fecha] || 0) + (p.monto_total / divisorMoneda);
    });

    // 2. DATA DOUGHNUT
    let aprobadas = 0, pendientes = 0, rechazadas = 0;
    pedidos.forEach(p => {
      if (['Aprobado - Por Preparar', 'En Camino', 'Entregado'].includes(p.estado_operativo)) aprobadas++;
      else if (['Rechazado', 'Cancelado'].includes(p.estado_operativo)) rechazadas++;
      else pendientes++;
    });

    // 3. DATA BARRAS
    const conteoProductos: any = {};
    exitosos.forEach(p => {
      (p.detalles || []).forEach((d: any) => {
        const nombre = d.item?.nombre || 'Desconocido';
        conteoProductos[nombre] = (conteoProductos[nombre] || 0) + ((d.precio_unitario * d.cantidad) / divisorMoneda);
      });
    });
    const topProdArray = Object.entries(conteoProductos).sort(([,a]:any, [,b]:any) => b - a).slice(0, 5);

    if (this.graficoVentas) this.graficoVentas.destroy();
    if (this.graficoEstados) this.graficoEstados.destroy();
    if (this.graficoTop) this.graficoTop.destroy();

    this.graficoVentas = new Chart(document.getElementById('ventasChart') as HTMLCanvasElement, {
      type: 'line',
      data: { labels: Object.keys(ventasPorDia).reverse(), datasets: [{ label: 'Ventas ($)', data: Object.values(ventasPorDia).reverse(), borderColor: '#4F46E5', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderWidth: 3, fill: true, tension: 0.4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: gridColor }, ticks: { color: textColor } }, x: { grid: { display: false }, ticks: { color: textColor } } } }
    });

    // Gráfico de Distribución Ultra-Pro
    this.graficoEstados = new Chart(document.getElementById('estadosChart') as HTMLCanvasElement, {
      type: 'doughnut',
      data: { 
        labels: ['Aprobadas', 'Pendientes', 'Rechazadas'], 
        datasets: [{ 
          data: [aprobadas, pendientes, rechazadas], 
          backgroundColor: ['#10B981', '#F59E0B', '#F43F5E'], 
          borderWidth: 4, 
          borderColor: borderColor,
          hoverOffset: 6
        }] 
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false, 
        cutout: '80%', // Anillo más delgado y elegante
        plugins: { 
          legend: { 
            position: 'bottom', 
            labels: { usePointStyle: true, padding: 25, color: textColor, font: { family: 'sans-serif', weight: 'bold', size: 11 } } 
          } 
        } 
      }
    });

    this.graficoTop = new Chart(document.getElementById('topProductosChart') as HTMLCanvasElement, {
      type: 'bar',
      data: { labels: topProdArray.map(p => p[0]), datasets: [{ label: 'Ingresos ($)', data: topProdArray.map(p => p[1]), backgroundColor: ['#4F46E5', '#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE'], borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: gridColor }, ticks: { color: textColor } }, y: { grid: { display: false }, ticks: { color: textColor } } } }
    });
  }

  abrirHistorial() {
    this.modalHistorialAbierto.set(true);
    this.cargandoHistorial.set(true);
    this.filtroEstado.set('Todos');
    this.filtroTexto.set('');
    
    setTimeout(() => {
      this.datePickerInstance = flatpickr('#rango-fechas', {
        mode: 'range',
        dateFormat: 'Y-m-d',
        altInput: true, // Esto crea un input visualmente hermoso
        altFormat: 'M j, Y', // Formato de lectura premium (Ej: Aug 25, 2026)
        onChange: (selectedDates) => {
          if (selectedDates.length === 2) {
            this.fechaInicio.set(selectedDates[0].toISOString());
            this.fechaFin.set(selectedDates[1].toISOString());
          } else if (selectedDates.length === 0) {
            this.fechaInicio.set('');
            this.fechaFin.set('');
          }
        }
      });
    }, 100);
    
    this.http.get(`${environment.apiUrl}/partner/history-orders/${this.token}`).subscribe({
      next: (res: any) => { if (res.ok) { this.historialPedidos.set(res.pedidos); setTimeout(() => this.actualizarGraficos(res.pedidos), 100); } this.cargandoHistorial.set(false); },
      error: () => { this.historialPedidos.set([]); this.cargandoHistorial.set(false); }
    });
  }

  limpiarFechas() { if(this.datePickerInstance) { this.datePickerInstance.clear(); this.fechaInicio.set(''); this.fechaFin.set(''); } }
  cerrarHistorial() { this.modalHistorialAbierto.set(false); }
formatPrice(price: number): string { 
    if (this.mostrarEnDolares()) {
      const priceUsd = price / this.tasaCambioCopAUsd;
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(priceUsd);
    } else {
      // COP sin centavos para que se vea limpio
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price); 
    }
  }

  // Utilidad para calcular 45 mins de entrega
  getTiempoEstimado(fechaStr: string): string {
    if (!fechaStr) return '--';
    const d = new Date(fechaStr);
    d.setMinutes(d.getMinutes() + 45);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
}
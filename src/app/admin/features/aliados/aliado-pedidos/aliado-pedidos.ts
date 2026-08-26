import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment'; // Ajusta tu ruta

@Component({
  selector: 'app-aliado-pedidos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './aliado-pedidos.html',
  styleUrls: ['./aliado-pedidos.scss'] // O .css según uses
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

  toggleTheme() { 
    this.isDarkMode.set(!this.isDarkMode()); 
  }

  volverAlCatalogo() {
    // Te devuelve al componente aliado-form usando el mismo token
    this.router.navigate(['/aliado', this.token]); 
  }

  cargarPedidos() {
    this.http.get(`${environment.apiUrl}/partner/live-orders/${this.token}`).subscribe({
      next: (res: any) => {
        if (res.ok) {
          this.pedidosActivos.set(res.pedidos);
        }
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }

  iniciarAutoRecarga() {
    // Recarga los pedidos automáticamente cada 15 segundos
    this.pollingInterval = setInterval(() => {
      this.cargarPedidos();
    }, 15000);
  }

  cambiarEstado(pedidoId: number, nuevoEstado: string) {
    // Aquí llamas a tu endpoint para actualizar el estado en BD
    this.http.patch(`${environment.apiUrl}/partner/order/${pedidoId}/status`, { estado: nuevoEstado })
      .subscribe((res: any) => {
        if (res.ok) {
          // Si pasó a entregado, lo sacamos de la pantalla
          if (nuevoEstado === 'Entregado') {
            this.pedidosActivos.update(list => list.filter(p => p.id !== pedidoId));
          } else {
            this.cargarPedidos(); // Refrescamos para ver el nuevo estado
          }
        }
      });
  }
}
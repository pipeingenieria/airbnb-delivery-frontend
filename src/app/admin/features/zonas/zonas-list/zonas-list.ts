import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';
import { Zona } from '../../../../models/admin.models';

@Component({
  selector: 'app-zonas-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zonas-list.html'
})
export class ZonasList implements OnInit {
  private adminService: AdminService = inject(AdminService);

  zonas = signal<Zona[]>([]);
  cargando = signal<boolean>(true);
  
  // Estado del Modal y Formulario
  modalAbierto = signal<boolean>(false);
  nuevaZona = signal<Zona>({
    nombre: '',
    ciudad: 'Medellín / Bello',
    activo: true
  });

  // Coordenadas simuladas para el mapa interactivo
  latitud = signal<number>(6.25184);
  longitud = signal<number>(-75.56359);

  ngOnInit() {
    this.cargarZonas();
  }

  cargarZonas() {
    this.cargando.set(true);
    this.adminService.getZonas().subscribe({
      next: (data) => {
        this.zonas.set(data);
        this.cargando.set(false);
      },
      error: (err) => {
        console.error('Error al conectar con FastAPI:', err);
        this.cargando.set(false);
      }
    });
  }

  abrirModalCrear() {
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
  }

  guardarZona() {
    const zonaData = this.nuevaZona();
    this.adminService.createZona(zonaData).subscribe({
      next: (res) => {
        this.zonas.set([...this.zonas(), res]);
        this.cerrarModal();
        // Reset form
        this.nuevaZona.set({ nombre: '', ciudad: 'Medellín / Bello', activo: true });
      },
      error: (err) => {
        console.error('Error al crear zona:', err);
        alert('Hubo un error al registrar la zona en la base de datos.');
      }
    });
  }
}
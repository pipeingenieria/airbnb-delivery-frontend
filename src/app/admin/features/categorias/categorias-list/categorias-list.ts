import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';
import { Categoria } from '../../../../models/admin.models'; // <-- Importamos el modelo real

@Component({
  selector: 'app-categorias-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './categorias-list.html'
})
export class CategoriasList implements OnInit {
  private adminService = inject(AdminService);

  // Estados de UI
  cargando = signal<boolean>(true);
  modalAbierto = signal<boolean>(false);
  editandoId = signal<number | null>(null);
  toastMessage = signal<string | null>(null);
  filtroTexto = signal<string>('');

  // Datos
  categorias = signal<Categoria[]>([]);
  
  // Formulario reactivo manual (Incluyendo requiere_despacho)
  nuevaCategoria = signal<Categoria>({
    nombre: '',
    descripcion: '',
    icono: '🍽️',
    activo: true,
    requiere_despacho: true // <-- Añadido para cumplir con tu modelo real
  });

  // Lista rápida de iconos/emojis predefinidos para la UI
  iconosDisponibles = ['🍽️', '🍔', '🍺', '💊', '🛒', '☕', '🥐', '🍦', '🥩', '🍕', '🥗', '🐶', '🎁', '⚡'];

  // Computed: Filtrado en tiempo real
  categoriasFiltradas = computed(() => {
    const term = this.filtroTexto().toLowerCase().trim();
    if (!term) return this.categorias();
    return this.categorias().filter(c => 
      c.nombre.toLowerCase().includes(term) || 
      (c.descripcion && c.descripcion.toLowerCase().includes(term))
    );
  });

  // Computed: Estadísticas rápidas
  totalActivas = computed(() => this.categorias().filter(c => c.activo).length);

  formularioValido = computed(() => {
    const cat = this.nuevaCategoria();
    return cat.nombre.trim().length > 2 && (cat.icono || '').trim() !== '';
  });

  ngOnInit() {
    this.cargarCategorias();
  }

  // --- Ojo: actualizamos también el reset del modal ---
  abrirModalCrear() {
    this.editandoId.set(null);
    this.nuevaCategoria.set({ nombre: '', descripcion: '', icono: '🍽️', activo: true, requiere_despacho: true });
    this.modalAbierto.set(true);
  }

  cargarCategorias() {
    this.cargando.set(true);
    this.adminService.getCategorias().subscribe({
      next: (data: any) => { // Ajusta el tipo según tu admin.service.ts
        this.categorias.set(data);
        this.cargando.set(false);
      },
      error: (err) => {
        console.error('Error cargando categorías', err);
        this.cargando.set(false);
        this.mostrarToast('❌ Error de conexión al cargar categorías');
      }
    });
  }


  abrirModalEditar(cat: Categoria) {
    this.editandoId.set(cat.id!);
    this.nuevaCategoria.set({ ...cat });
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
  }

  seleccionarIcono(icono: string) {
    this.nuevaCategoria.update(c => ({ ...c, icono }));
  }

  toggleEstadoFila(cat: Categoria) {
    const dataActualizada = { ...cat, activo: !cat.activo };
    this.adminService.updateCategoria(cat.id!, dataActualizada).subscribe({
      next: () => {
        this.cargarCategorias();
        this.mostrarToast(dataActualizada.activo ? `✅ Categoría ${cat.nombre} activada.` : `⚠️ Categoría ${cat.nombre} pausada.`);
      },
      error: () => this.mostrarToast('❌ Error al cambiar el estado.')
    });
  }

  guardarCategoria() {
    if (!this.formularioValido()) return;

    const data = this.nuevaCategoria();
    
    if (this.editandoId()) {
      this.adminService.updateCategoria(this.editandoId()!, data).subscribe({
        next: () => {
          this.mostrarToast('✅ Categoría actualizada con éxito.');
          this.cargarCategorias();
          this.cerrarModal();
        },
        error: () => this.mostrarToast('❌ Error al actualizar la categoría.')
      });
    } else {
      this.adminService.createCategoria(data).subscribe({
        next: () => {
          this.mostrarToast('🎉 Nueva categoría creada y disponible para los Aliados.');
          this.cargarCategorias();
          this.cerrarModal();
        },
        error: () => this.mostrarToast('❌ Error al crear la categoría.')
      });
    }
  }

  eliminarCategoria(cat: Categoria) {
    if (confirm(`⚠️ ¿Estás seguro de eliminar la categoría "${cat.nombre}"? Esto podría afectar a los Aliados asignados a ella.`)) {
      this.adminService.deleteCategoria(cat.id!).subscribe({
        next: () => {
          this.mostrarToast(`🗑️ Categoría eliminada.`);
          this.cargarCategorias();
        },
        error: () => this.mostrarToast('❌ No se puede eliminar. Es probable que tenga Aliados asignados.')
      });
    }
  }

  actualizarFiltro(event: any) {
    this.filtroTexto.set(event.target.value);
  }

  mostrarToast(mensaje: string) {
    this.toastMessage.set(mensaje);
    setTimeout(() => this.toastMessage.set(null), 4000);
  }
}
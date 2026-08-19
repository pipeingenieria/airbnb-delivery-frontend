import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdminService } from '../../../services/admin.service'; 

export interface CatalogoItem {
  id?: number;
  seccion: string;
  nombre: string;
  descripcion: string;
  precio_base: number;
  imagen_url: string;
  disponible: boolean;
}

@Component({
  selector: 'app-aliado-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './aliado-form.html',
  styleUrls: ['./aliado-form.scss']
})
export class AliadoForm implements OnInit {
  private route = inject(ActivatedRoute);
  private adminService = inject(AdminService);

  currentToken: string = '';
  isDarkMode = signal<boolean>(true);
  cargando = signal<boolean>(true);
  errorToken = signal<boolean>(false);
  toastMessage = signal<string | null>(null);
  toastTimeout: any;

  aliadoInfo = signal<any>(null);
  catalogo = signal<CatalogoItem[]>([]);

  // Modales
  modalAbierto = signal<boolean>(false);
  modalSeccionesAbierto = signal<boolean>(false);
  
  subiendoImagen = signal<boolean>(false);
  editandoId = signal<number | null>(null);
  imagenPreview = signal<string | null>(null);
  precioVisual = signal<string>('');

  // Gestor de Secciones
  seccionesManuales = signal<string[]>(['Menú Principal']);
  nuevaSeccionInput = signal<string>('');
  seccionEditando = signal<string | null>(null);
  seccionEditandoInput = signal<string>('');

  nuevoProducto = signal<CatalogoItem>({
    seccion: 'Menú Principal',
    nombre: '',
    descripcion: '',
    precio_base: 0,
    imagen_url: '',
    disponible: true
  });

  // AGRUPACIÓN MAGICA PARA LA VISTA PREVIA DE LA CARTA Y LA UI
  seccionesDisponibles = computed(() => {
    const secItems = this.catalogo().map(i => i.seccion);
    return Array.from(new Set([...this.seccionesManuales(), ...secItems]));
  });

  menuAgrupado = computed(() => {
    const grupos = new Map<string, CatalogoItem[]>();
    // Inicializamos todas las secciones disponibles (incluso las vacías)
    this.seccionesDisponibles().forEach(sec => grupos.set(sec, []));
    
    // Llenamos con los productos reales
    this.catalogo().forEach(item => {
      const sec = item.seccion || 'Menú Principal';
      if (!grupos.has(sec)) grupos.set(sec, []);
      grupos.get(sec)!.push(item);
    });
    
    return Array.from(grupos, ([seccion, items]) => ({ seccion, items }));
  });

  totalProductos = computed(() => this.catalogo().length);

  formularioValido = computed(() => {
    const p = this.nuevoProducto();
    const nombreValido = typeof p.nombre === 'string' && p.nombre.trim().length > 2;
    const precioValido = typeof p.precio_base === 'number' && p.precio_base > 0;
    const imagenValida = typeof p.imagen_url === 'string' && p.imagen_url.trim() !== '';
    return nombreValido && precioValido && imagenValida && !this.subiendoImagen();
  });

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const token = params.get('token');
      if (token) this.cargarDatosPortal(token);
      else { this.errorToken.set(true); this.cargando.set(false); }
    });
  }

  toggleTheme() { this.isDarkMode.set(!this.isDarkMode()); }

  showToast(message: string) {
    this.toastMessage.set(message);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage.set(null), 3000);
  }

  cargarDatosPortal(token: string) {
    this.cargando.set(true);
    this.currentToken = token;
    
    this.adminService.getPortalAliado(token).subscribe({
      next: (res) => {
        this.aliadoInfo.set(res.aliado);
        this.catalogo.set(res.catalogo);
        // Extraemos las secciones que ya traiga de BD
        const secItems = res.catalogo.map((i: any) => i.seccion);
        this.seccionesManuales.set(Array.from(new Set(['Menú Principal', ...secItems])));
        this.cargando.set(false);
      },
      error: () => {
        this.errorToken.set(true);
        this.cargando.set(false);
      }
    });
  }

  // --- GESTOR DE SECCIONES ---
  abrirModalSecciones() {
    this.modalSeccionesAbierto.set(true);
    this.nuevaSeccionInput.set('');
  }
  
  cerrarModalSecciones() {
    this.modalSeccionesAbierto.set(false);
    this.seccionEditando.set(null);
  }

  agregarSeccionManual() {
    const val = this.nuevaSeccionInput().trim();
    if (val && !this.seccionesManuales().includes(val)) {
      this.seccionesManuales.update(list => [...list, val]);
      this.nuevaSeccionInput.set('');
    }
  }

  iniciarEdicionSeccion(sec: string) {
    this.seccionEditando.set(sec);
    this.seccionEditandoInput.set(sec);
  }

  guardarEdicionSeccion(oldSec: string) {
    const newSec = this.seccionEditandoInput().trim();
    if (newSec && newSec !== oldSec && !this.seccionesManuales().includes(newSec)) {
      this.seccionesManuales.update(list => list.map(s => s === oldSec ? newSec : s));
      const productosAActualizar = this.catalogo().filter(p => p.seccion === oldSec);
      
      // Actualización Optimista en UI
      this.catalogo.update(list => list.map(p => p.seccion === oldSec ? { ...p, seccion: newSec } : p));
      
      // Enviar cambios silenciosos a la BD
      productosAActualizar.forEach(p => {
         this.adminService.updateCatalogoItem(this.currentToken, p.id!, { seccion: newSec }).subscribe();
      });
    }
    this.seccionEditando.set(null);
  }

  eliminarSeccion(sec: string) {
    const productosEnSeccion = this.catalogo().filter(p => p.seccion === sec);
    
    // 1. Construir el mensaje dependiendo de si hay productos o está vacía
    const mensaje = productosEnSeccion.length > 0 
      ? `⚠️ ATENCIÓN: Hay ${productosEnSeccion.length} producto(s) en la sección "${sec}".\n\n¿Estás seguro de eliminar la sección y TODOS sus productos permanentemente?`
      : `⚠️ ¿Estás seguro de eliminar la sección "${sec}"?`;

    // 2. SIEMPRE preguntar antes de proceder
    if (!confirm(mensaje)) return;

    // 3. Si hay productos, los eliminamos de la BD y de la vista
    if (productosEnSeccion.length > 0) {
      productosEnSeccion.forEach(p => {
         this.adminService.deleteCatalogoItem(this.currentToken, p.id!).subscribe();
      });
      this.catalogo.update(list => list.filter(p => p.seccion !== sec));
    }
    
    // 4. Finalmente, eliminamos la sección de la lista manual
    this.seccionesManuales.update(list => list.filter(s => s !== sec));
    this.showToast(`🗑️ Sección "${sec}" eliminada`);
  }

  // --- GESTOR DE PRODUCTOS ---
  abrirModalCrear(seccionPredefinida?: string) {
    this.editandoId.set(null);
    this.imagenPreview.set(null);
    this.precioVisual.set('');
    this.nuevoProducto.set({ seccion: seccionPredefinida || 'Menú Principal', nombre: '', descripcion: '', precio_base: 0, imagen_url: '', disponible: true });
    this.modalAbierto.set(true);
  }

  abrirModalEditar(producto: CatalogoItem) {
    this.editandoId.set(producto.id!);
    this.imagenPreview.set(producto.imagen_url);
    this.precioVisual.set(producto.precio_base ? producto.precio_base.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '');
    this.nuevoProducto.set({ ...producto });
    this.modalAbierto.set(true);
  }

  cerrarModal() { this.modalAbierto.set(false); }

  // FIX MÁGICO: Esta función fuerza a Angular Signals a notar el cambio
  actualizarCampo(campo: keyof CatalogoItem, valor: any) {
    this.nuevoProducto.update(p => ({ ...p, [campo]: valor }));
  }

  onPrecioInput(event: Event) {
    const input = event.target as HTMLInputElement;
    let rawValue = input.value.replace(/,/g, '');
    let numericString = rawValue.replace(/[^0-9.]/g, '');
    const parts = numericString.split('.');
    if (parts.length > 2) numericString = parts[0] + '.' + parts.slice(1).join('');

    const parsed = parseFloat(numericString);
    this.nuevoProducto.update(p => ({ ...p, precio_base: isNaN(parsed) ? 0 : parsed }));
    
    if (numericString) {
      if (parts[0]) parts[0] = parseInt(parts[0], 10).toLocaleString('en-US');
      this.precioVisual.set(parts.join('.'));
    } else {
      this.precioVisual.set('');
    }
  }

  toggleDisponibilidad(producto: CatalogoItem, event: Event) {
    event.stopPropagation();
    const status = !producto.disponible;
    this.adminService.updateCatalogoItem(this.currentToken, producto.id!, { disponible: status }).subscribe({
      next: () => {
        this.catalogo.update(list => list.map(p => p.id === producto.id ? { ...p, disponible: status } : p));
        this.showToast(status ? `✅ ${producto.nombre} visible en la carta` : `👁️‍🗨️ ${producto.nombre} oculto`);
      }
    });
  }

  guardarProducto() {
    if (!this.formularioValido()) return;
    const p = this.nuevoProducto();

    if (this.editandoId()) {
      this.adminService.updateCatalogoItem(this.currentToken, this.editandoId()!, p).subscribe({
        next: (res) => {
          this.catalogo.update(list => list.map(item => item.id === this.editandoId() ? res : item));
          this.showToast('✅ Plato actualizado en la carta');
          this.cerrarModal();
        }
      });
    } else {
      this.adminService.createCatalogoItem(this.currentToken, p).subscribe({
        next: (res) => {
          this.catalogo.update(list => [...list, res]);
          this.showToast('🎉 Añadido a la carta exitosamente');
          this.cerrarModal();
        }
      });
    }
  }

  eliminarProducto(id: number, event: Event) {
    event.stopPropagation();
    if (confirm('⚠️ ¿Retirar este producto del menú permanentemente?')) {
      this.adminService.deleteCatalogoItem(this.currentToken, id).subscribe({
        next: () => {
          this.catalogo.update(list => list.filter(p => p.id !== id));
          this.showToast('🗑️ Retirado de la carta');
        }
      });
    }
  }

  async onImagenSeleccionada(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => this.imagenPreview.set(reader.result as string);
      reader.readAsDataURL(file);

      this.subiendoImagen.set(true);
      try {
        const archivoOptimizado = await this.comprimirImagenProfesional(file, 800, 800, 0.85);
        this.adminService.uploadImagen(archivoOptimizado).subscribe({
          next: (res) => {
            this.nuevoProducto.update(p => ({ ...p, imagen_url: res.url.replace('/upload/', '/upload/q_auto,f_auto/') }));
            this.subiendoImagen.set(false);
          },
          error: () => {
            this.showToast('❌ Error subiendo la imagen');
            this.subiendoImagen.set(false);
          }
        });
      } catch { 
        this.showToast('❌ Error comprimiendo la imagen');
        this.subiendoImagen.set(false); 
      }
    }
  }

  private async comprimirImagenProfesional(file: File, maxWidth: number, maxHeight: number, quality: number): Promise<File> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image(); img.src = e.target?.result as string;
        img.onload = () => {
          let w = img.width; let h = img.height;
          if (w > h && w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
          else if (h > maxHeight) { w = Math.round((w * maxHeight) / h); h = maxHeight; }
          const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d'); if (!ctx) return reject();
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((b) => { if (!b) return reject(); resolve(new File([b], `${file.name}_opt.webp`, { type: 'image/webp' })); }, 'image/webp', quality);
        };
      };
    });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price);
  }
}
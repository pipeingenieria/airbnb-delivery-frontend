import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdminService } from '../../../services/admin.service'; 
import { forkJoin } from 'rxjs';

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
  
  // SEÑALES NUEVAS PARA LÓGICA ESPACIAL Y SIMULACIÓN
  propiedadesBD = signal<any[]>([]);
  zonasBD = signal<any[]>([]);
  modalSimulacionAbierto = signal<boolean>(false);
  simulacionData = signal<any>(null);

  modalAbierto = signal<boolean>(false);
  modalSeccionesAbierto = signal<boolean>(false);
  
  subiendoImagen = signal<boolean>(false);
  editandoId = signal<number | null>(null);
  imagenPreview = signal<string | null>(null);
  precioVisual = signal<string>('');

  seccionesManuales = signal<string[]>([]);
  nuevaSeccionInput = signal<string>('');
  seccionEditando = signal<string | null>(null);
  seccionEditandoInput = signal<string>('');

  nuevoProducto = signal<CatalogoItem>({
    seccion: '',
    nombre: '',
    descripcion: '',
    precio_base: 0,
    imagen_url: '',
    disponible: true
  });

  esRestaurante = computed(() => {
    const cat = this.aliadoInfo()?.categoria || '';
    return cat.toLowerCase().includes('restaurant') || cat.toLowerCase().includes('comida');
  });

  seccionPorDefecto = computed(() => this.esRestaurante() ? 'Menú Principal' : 'Catálogo General');

  seccionesDisponibles = computed(() => {
    const secItems = this.catalogo().map(i => i.seccion);
    return Array.from(new Set([...this.seccionesManuales(), ...secItems]));
  });

  menuAgrupado = computed(() => {
    const grupos = new Map<string, CatalogoItem[]>();
    this.seccionesDisponibles().forEach(sec => grupos.set(sec, []));
    
    this.catalogo().forEach(item => {
      const sec = item.seccion || this.seccionPorDefecto();
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

  // ==============================================
  // MOTOR GEOLÓGICO: Cálculo Haversine en Frontend
  // ==============================================
  propiedadesCubiertas = computed(() => {
    const aliado = this.aliadoInfo();
    const zonas = this.zonasBD() || [];
    const propiedades = this.propiedadesBD() || [];

    if (!aliado || !zonas.length || !propiedades.length) return [];

    const latA = Number(aliado.latitud);
    const lngA = Number(aliado.longitud);

    if (isNaN(latA) || isNaN(lngA)) return [];

    // 1. ZONAS DEL NEGOCIO (Estrictamente Espacial)
    // El aliado solo entra si sus coordenadas están físicamente dentro del radio de la zona.
    const zonasDelAliado = zonas.filter(z => {
      if (z.activo === false) return false;
      
      const latZ = Number(z.latitud);
      const lngZ = Number(z.longitud);
      const radio = Number(z.radio);

      if (latZ && lngZ && radio) {
        return this.haversine(latA, lngA, latZ, lngZ) <= radio;
      }
      return false;
    });

    if (zonasDelAliado.length === 0) return [];

    // 2. AIRBNBS EN ALCANCE (Estrictamente Espacial)
    // Listamos solo las propiedades que físicamente caen dentro de ESAS mismas zonas.
    const propsEnAlcance = propiedades.filter(p => {
      if (p.activo === false) return false;

      const latP = Number(p.latitud);
      const lngP = Number(p.longitud);
      
      if (!latP || !lngP) return false;

      return zonasDelAliado.some(z => {
        const latZ = Number(z.latitud);
        const lngZ = Number(z.longitud);
        return this.haversine(latP, lngP, latZ, lngZ) <= Number(z.radio);
      });
    });

    // 3. ORDEN: De la más cerca a la más lejos
    return propsEnAlcance.map(p => {
      const latP = Number(p.latitud);
      const lngP = Number(p.longitud);
      return { 
        ...p, 
        distanciaMetros: Math.round(this.haversine(latA, lngA, latP, lngP)) 
      };
    }).sort((a, b) => a.distanciaMetros - b.distanciaMetros);
  });

  haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; 
    const f1 = lat1 * Math.PI / 180;
    const f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(df / 2) * Math.sin(df / 2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

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
    
    forkJoin({
      portal: this.adminService.getPortalAliado(token),
      props: this.adminService.getPropiedades(), 
      zonas: this.adminService.getZonas(),
      todosLosAliados: this.adminService.getAliados() 
    }).subscribe({
      next: (res: any) => {
        // 🔍 CORRECCIÓN: Fusionamos los datos inteligentemente
        const aliadoBasico = res.portal.aliado;
        const aliadoRed = res.todosLosAliados.find((a: any) => a.id === aliadoBasico.id);
        
        // Conservamos los textos formateados (como .categoria) y solo sobreescribimos la data espacial
        const aliadoFusionado = {
          ...aliadoBasico, 
          latitud: aliadoRed?.latitud || aliadoBasico.latitud,
          longitud: aliadoRed?.longitud || aliadoBasico.longitud,
          zona_id: aliadoRed?.zona_id || aliadoBasico.zona_id
        };
        
        this.aliadoInfo.set(aliadoFusionado); 
        
        this.catalogo.set(res.portal.catalogo);
        const secItems = res.portal.catalogo.map((i: any) => i.seccion);
        this.seccionesManuales.set(Array.from(new Set([this.seccionPorDefecto(), ...secItems])));
        
        this.propiedadesBD.set(res.props);
        this.zonasBD.set(res.zonas);

        this.cargando.set(false);
      },
      error: () => {
        this.errorToken.set(true); 
        this.cargando.set(false);
      }
    });
  }

  abrirSimulacion() {
    const props = this.propiedadesCubiertas();
    if (props.length === 0) {
      this.showToast('⚠️ No tienes propiedades en tu radio de cobertura actual para simular.');
      return;
    }

    const count = props.length;
    // Simulamos un comportamiento realista (40% de las propiedades ordenando)
    const ordenesDia = Math.max(1, Math.round(count * 0.4)); 
    const ordenesMes = ordenesDia * 30;
    const ordenesAno = ordenesMes * 12;
    
    const ticketPromedio = this.esRestaurante() ? 25 : 15; // Estimado USD

    const recientes = [];
    for(let i=0; i < Math.min(5, count); i++) {
      recientes.push({
        id: Math.floor(1000 + Math.random() * 9000),
        propiedad: props[i].nombre,
        monto: ticketPromedio + Math.floor(Math.random() * 20),
        estado: ['Preparando', 'En Camino', 'Entregado'][Math.floor(Math.random() * 3)],
        minutos: Math.floor(Math.random() * 50) + 2
      });
    }

    this.simulacionData.set({
      diario: { ordenes: ordenesDia, ingresos: ordenesDia * ticketPromedio },
      mensual: { ordenes: ordenesMes, ingresos: ordenesMes * ticketPromedio },
      anual: { ordenes: ordenesAno, ingresos: ordenesAno * ticketPromedio },
      recientes: recientes.sort((a,b) => a.minutos - b.minutos)
    });

    this.modalSimulacionAbierto.set(true);
  }

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
      
      this.catalogo.update(list => list.map(p => p.seccion === oldSec ? { ...p, seccion: newSec } : p));
      
      productosAActualizar.forEach(p => {
         this.adminService.updateCatalogoItem(this.currentToken, p.id!, { seccion: newSec }).subscribe();
      });
    }
    this.seccionEditando.set(null);
  }

  eliminarSeccion(sec: string) {
    const productosEnSeccion = this.catalogo().filter(p => p.seccion === sec);
    const mensaje = productosEnSeccion.length > 0 
      ? `⚠️ ATENCIÓN: Hay ${productosEnSeccion.length} producto(s) en la categoría "${sec}".\n\n¿Estás seguro de eliminar la categoría y TODOS sus productos permanentemente?`
      : `⚠️ ¿Estás seguro de eliminar la categoría "${sec}"?`;

    if (!confirm(mensaje)) return;

    if (productosEnSeccion.length > 0) {
      productosEnSeccion.forEach(p => {
         this.adminService.deleteCatalogoItem(this.currentToken, p.id!).subscribe();
      });
      this.catalogo.update(list => list.filter(p => p.seccion !== sec));
    }
    
    this.seccionesManuales.update(list => list.filter(s => s !== sec));
    this.showToast(`🗑️ Categoría "${sec}" eliminada`);
  }

  abrirModalCrear(seccionPredefinida?: string) {
    this.editandoId.set(null);
    this.imagenPreview.set(null);
    this.precioVisual.set('');
    this.nuevoProducto.set({ seccion: seccionPredefinida || this.seccionPorDefecto(), nombre: '', descripcion: '', precio_base: 0, imagen_url: '', disponible: true });
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
        this.showToast(status ? `✅ ${producto.nombre} visible en ${this.esRestaurante() ? 'la carta' : 'el catálogo'}` : `👁️‍🗨️ ${producto.nombre} oculto`);
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
          this.showToast(`✅ ${this.esRestaurante() ? 'Plato actualizado en la carta' : 'Producto actualizado en el catálogo'}`);
          this.cerrarModal();
        }
      });
    } else {
      this.adminService.createCatalogoItem(this.currentToken, p).subscribe({
        next: (res) => {
          this.catalogo.update(list => [...list, res]);
          this.showToast(`🎉 Añadido ${this.esRestaurante() ? 'a la carta' : 'al catálogo'} exitosamente`);
          this.cerrarModal();
        }
      });
    }
  }

  eliminarProducto(id: number, event: Event) {
    event.stopPropagation();
    const mensaje = `⚠️ ¿Retirar este ${this.esRestaurante() ? 'plato del menú' : 'producto del catálogo'} permanentemente?`;
    if (confirm(mensaje)) {
      this.adminService.deleteCatalogoItem(this.currentToken, id).subscribe({
        next: () => {
          this.catalogo.update(list => list.filter(p => p.id !== id));
          this.showToast(`🗑️ Retirado ${this.esRestaurante() ? 'de la carta' : 'del catálogo'}`);
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
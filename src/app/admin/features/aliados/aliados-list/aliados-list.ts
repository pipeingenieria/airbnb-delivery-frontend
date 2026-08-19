import { Component, inject, OnInit, signal, computed, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';
import { Aliado, Categoria, Propiedad, Zona } from '../../../../models/admin.models';
import { forkJoin } from 'rxjs';
import * as L from 'leaflet';

@Component({
  selector: 'app-aliados-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './aliados-list.html'
})
export class AliadosList implements OnInit, AfterViewInit {
  private adminService = inject(AdminService);

  cargando = signal<boolean>(true);
  subiendoImagen = signal<boolean>(false);
  modalAbierto = signal<boolean>(false);
  editandoId = signal<number | null>(null);
  toastMessage = signal<string | null>(null);
  filtroTexto = signal<string>('');
  imagenPreview = signal<string | null>(null);
  busquedaDireccion = signal<string>('');

  showCelebration = signal<boolean>(false);

  // --- NUEVOS ESTADOS PARA MODAL DE CONTACTO ---
  modalContactoAbierto = signal<boolean>(false);
  aliadoEnContacto = signal<Aliado | null>(null);
  contactoEdicionDirecta = signal<Aliado | null>(null);

  aliados = signal<Aliado[]>([]);
  categorias = signal<Categoria[]>([]);
  zonas = signal<Zona[]>([]);
  propiedades = signal<Propiedad[]>([]); 
  
  zonasQueCubren = signal<Zona[]>([]);

  nuevoAliado = signal<Aliado>({
    nombre: '',
    direccion: 'Buscando...',
    latitud: 6.3373,
    longitud: -75.5579,
    categoria_id: null,
    zona_id: null,
    estado_operativo: 'Cerrado', // Nace cerrado por defecto hasta tener contacto
    correo_contacto: '',
    nombre_contacto: '', // <-- AÑADIR
    telefono_contacto: '',
    logo_url: ''
  });

  aliadosFiltrados = computed(() => {
    const term = this.filtroTexto().toLowerCase().trim();
    if (!term) return this.aliados();
    return this.aliados().filter(a => 
      a.nombre.toLowerCase().includes(term) || 
      (a.correo_contacto && a.correo_contacto.toLowerCase().includes(term))
    );
  });

  esDireccionValida = computed(() => {
    const dir = (this.nuevoAliado().direccion || '').toLowerCase().trim();
    const invalidos = ['buscando...', 'calculando ubicación...', 'ubicación seleccionada'];
    return dir.length > 5 && !invalidos.includes(dir);
  });

  formularioValido = computed(() => {
    if (this.subiendoImagen()) return false;
    const a = this.nuevoAliado();
    return a.nombre.trim().length > 2 && a.categoria_id !== null && a.zona_id !== null && this.esDireccionValida();
  });

  // --- MAPAS LEAFLET ---
  private map!: L.Map;
  private markersLayer = L.layerGroup();
  private propsLayer = L.layerGroup();
  private mainZonasLayer = L.layerGroup(); 
  private miniMap: L.Map | null = null;
  private miniMapMarker: L.Marker | null = null;
  private miniZonasLayer = L.layerGroup();

  ngOnInit() { this.cargarDatos(); }
  ngAfterViewInit() { this.initMainMap(); }

  lanzarCelebracion() {
    this.showCelebration.set(true);
    setTimeout(() => this.showCelebration.set(false), 4500);
  }

  cargarDatos() {
    this.cargando.set(true);
    forkJoin({
      aliados: this.adminService.getAliados(),
      categorias: this.adminService.getCategorias(),
      zonas: this.adminService.getZonas(),
      propiedades: this.adminService.getPropiedades()
    }).subscribe({
      next: (res) => {
        this.aliados.set(res.aliados);
        this.categorias.set(res.categorias.filter((c: any) => c.activo));
        this.zonas.set(res.zonas.filter((z: any) => z.activo));
        this.propiedades.set(res.propiedades);
        this.actualizarMarcadoresEnMapa();
        this.cargando.set(false);
      },
      error: () => { this.mostrarToast('❌ Error cargando la información.'); this.cargando.set(false); }
    });
  }

  // --- LÓGICA MAPA PRINCIPAL ---
  initMainMap() {
    if (this.map) this.map.remove();
    this.map = L.map('aliados-map', { zoomControl: false, preferCanvas: true }).setView([6.3373, -75.5579], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this.map);
    
    this.mainZonasLayer.addTo(this.map);
    this.propsLayer.addTo(this.map);
    this.markersLayer.addTo(this.map);

    this.map.on('dblclick', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      this.abrirModalCrear(e.latlng.lat, e.latlng.lng);
    });

    setTimeout(() => { this.map.invalidateSize(); this.actualizarMarcadoresEnMapa(); }, 200);
  }

  actualizarMarcadoresEnMapa() {
    if (!this.map) return;
    this.markersLayer.clearLayers();
    this.mainZonasLayer.clearLayers();
    this.propsLayer.clearLayers();

    this.zonas().forEach(zona => {
      if (zona.latitud && zona.longitud && zona.radio) {
        L.circle([Number(zona.latitud), Number(zona.longitud)], { color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.1, radius: Number(zona.radio), interactive: false }).addTo(this.mainZonasLayer);
      }
    });

    this.propiedades().forEach(p => {
      if (p.latitud && p.longitud) {
        L.circleMarker([Number(p.latitud), Number(p.longitud)], { radius: 3, color: '#475569', fillColor: '#64748b', fillOpacity: 0.5, weight: 1, interactive: false }).addTo(this.propsLayer);
      }
    });

    this.aliados().forEach(aliado => {
      if (aliado.latitud && aliado.longitud) {
        const colorPin = aliado.estado_operativo === 'Abierto' ? '#f43f5e' : '#64748b'; 
        const iconoInfo = this.getCategoriaInfo(aliado.categoria_id);
        const innerContent = aliado.logo_url ? `<img src="${aliado.logo_url}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:16px;">${iconoInfo.icono}</span>`;

        const pinIcon = L.divIcon({ 
          className: 'custom-aliado-pin', 
          html: `<div style="background-color: ${colorPin}; width: 36px; height: 36px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 15px ${colorPin}; display:flex; align-items:center; justify-content:center; overflow:hidden;">${innerContent}</div>`, 
          iconSize: [36, 36], iconAnchor: [18, 18]
        });

        const marker = L.marker([aliado.latitud, aliado.longitud], { icon: pinIcon });
        marker.on('click', (e: any) => L.DomEvent.stopPropagation(e));
        marker.bindPopup(`<div style="padding:4px;text-align:center;"><b>${aliado.nombre}</b><br><span style="font-size:10px;">${iconoInfo.nombre}</span></div>`);
        marker.on('dblclick', (e: any) => { L.DomEvent.stopPropagation(e); this.abrirModalEditar(aliado); });
        this.markersLayer.addLayer(marker);
      }
    });
  }

  // --- LÓGICA MINI-MAPA ---
  initMiniMap(lat: number, lng: number) {
    if (this.miniMap) this.miniMap.remove();
    this.miniMap = L.map('minimap-aliado', { zoomControl: false, preferCanvas: true }).setView([lat, lng], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(this.miniMap);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.miniMap);
    this.miniZonasLayer.addTo(this.miniMap);

    const pinIcon = L.divIcon({ className: 'custom-map-pin', html: `<div style="background-color: #f43f5e; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 15px #f43f5e;"></div>`, iconSize: [18, 18] });
    this.miniMapMarker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(this.miniMap);
    
    this.calcularCobertura(lat, lng);

    this.miniMapMarker.on('drag', (e) => { const pos = e.target.getLatLng(); this.calcularCobertura(pos.lat, pos.lng); });
    this.miniMapMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      this.nuevoAliado.update(a => ({ ...a, latitud: pos.lat, longitud: pos.lng }));
      this.obtenerDireccionAutomatica(pos.lat, pos.lng);
    });
    setTimeout(() => this.miniMap?.invalidateSize(), 250);
  }

  calcularCobertura(lat: number, lng: number) {
    if (!this.miniMap) return;
    this.miniZonasLayer.clearLayers();
    const pinLatLng = L.latLng(lat, lng);
    const zonasIntersectadas: Zona[] = [];

    this.zonas().forEach(zona => {
      if (zona.latitud && zona.longitud && zona.radio) {
        const zonaLatLng = L.latLng(Number(zona.latitud), Number(zona.longitud));
        const estaAdentro = pinLatLng.distanceTo(zonaLatLng) <= Number(zona.radio);
        if (estaAdentro) {
          zonasIntersectadas.push(zona);
          L.circle(zonaLatLng, { color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.25, radius: Number(zona.radio), interactive: false }).addTo(this.miniZonasLayer);
        } else {
          L.circle(zonaLatLng, { color: '#475569', weight: 1, fillColor: '#334155', fillOpacity: 0.15, radius: Number(zona.radio), interactive: false }).addTo(this.miniZonasLayer);
        }
      }
    });
    
    this.zonasQueCubren.set(zonasIntersectadas);
    this.nuevoAliado.update(a => ({ ...a, zona_id: zonasIntersectadas.length > 0 ? zonasIntersectadas[0].id! : null }));
  }

  async obtenerDireccionAutomatica(lat: number, lng: number) {
    try {
      this.nuevoAliado.update(a => ({ ...a, direccion: 'Calculando ubicación...' }));
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await response.json();
      if (data && data.address) {
        const road = data.address.road || data.address.pedestrian || '';
        const suburb = data.address.suburb || data.address.neighbourhood || '';
        const city = data.address.city || data.address.town || 'Bello';
        this.nuevoAliado.update(a => ({ ...a, direccion: [road, suburb, city].filter(Boolean).join(', ') }));
      }
    } catch { this.nuevoAliado.update(a => ({ ...a, direccion: 'Ubicación seleccionada' })); }
  }

  async buscarEnMapaPrincipal() {
    const query = this.busquedaDireccion();
    if (!query) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Antioquia, Colombia')}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) this.map.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16, { duration: 1.5 });
    } catch (e) { }
  }

  async buscarDireccionModal() {
    const query = this.nuevoAliado().direccion;
    if (!query) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Antioquia, Colombia')}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat); const lng = parseFloat(data[0].lon);
        this.nuevoAliado.update(a => ({ ...a, latitud: lat, longitud: lng }));
        if (this.miniMap) this.miniMap.flyTo([lat, lng], 16);
        if (this.miniMapMarker) this.miniMapMarker.setLatLng([lat, lng]);
        this.calcularCobertura(lat, lng);
      }
    } catch (e) { }
  }

  // --- LÓGICA DEL MODAL DE CONTACTO UNIFICADO (NUEVO) ---

  abrirContactoDesdeDirectorio(aliado: Aliado, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.contactoEdicionDirecta.set(aliado);
    this.aliadoEnContacto.set({ ...aliado });
    this.modalContactoAbierto.set(true);
  }

  abrirModalContactoIndiv(event: Event) {
    event.preventDefault();
    this.aliadoEnContacto.set({ ...this.nuevoAliado() });
    this.modalContactoAbierto.set(true);
  }

  cerrarModalContacto() {
    this.modalContactoAbierto.set(false);
    this.aliadoEnContacto.set(null);
    this.contactoEdicionDirecta.set(null);
  }

  guardarContacto() {
    const modificado = this.aliadoEnContacto();
    if (!modificado) return;

    modificado.nombre_contacto = modificado.nombre_contacto?.trim() || '';
    modificado.correo_contacto = modificado.correo_contacto?.trim() || '';
    modificado.telefono_contacto = modificado.telefono_contacto?.trim() || '';

    // AHORA VALIDA LOS 3 CAMPOS (Nombre, Correo, Teléfono)
    const faltaInfo = !modificado.nombre_contacto || !modificado.correo_contacto || !modificado.telefono_contacto;
    
    if (faltaInfo) {
       modificado.estado_operativo = 'Cerrado';
       this.mostrarToast(`⚠️ Faltan datos. El comercio no se puede activar sin nombre, correo y teléfono.`);
    } else {
       modificado.estado_operativo = 'Abierto';
    }

    const directa = this.contactoEdicionDirecta();

    // Si se está editando desde el directorio (ya existe en BD)
    if (directa && directa.id) {
       const original = this.aliados().find(a => a.id === directa.id);
       if (original) {
          const teniaCorreoAntes = !!original.correo_contacto;
          const tieneCorreoAhora = !!modificado.correo_contacto;
          const esPrimeraVez = !teniaCorreoAntes && tieneCorreoAhora;

          this.adminService.updateAliado(directa.id, modificado).subscribe({
             next: () => {
                if (!faltaInfo) {
                  if (esPrimeraVez) {
                      this.adminService.notificarAliado(directa.id!).subscribe();
                      this.mostrarToast(`🎉 Credenciales guardadas. Notificación enviada a ${modificado.correo_contacto}.`);
                      this.lanzarCelebracion();
                  } else {
                      this.mostrarToast(`🎉 Contacto actualizado y comercio en línea.`);
                  }
                }
                this.cargarDatos(); 
                this.cerrarModalContacto();
             },
             error: () => alert('Error guardando contacto directo.')
          });
       }
       return;
    }

    // Si se está editando desde el Modal de Creación (aún no existe en BD)
    this.nuevoAliado.update(a => ({
       ...a,
       estado_operativo: modificado.estado_operativo,
       nombre_contacto: modificado.nombre_contacto,
       correo_contacto: modificado.correo_contacto,
       telefono_contacto: modificado.telefono_contacto
    }));
    
    this.cerrarModalContacto();
  }

  toggleEstadoMaestro(estado: boolean) {
    const a = this.nuevoAliado();
    const faltaInfo = !a.correo_contacto?.trim() || !a.telefono_contacto?.trim();
    
    if (estado && faltaInfo) {
       this.mostrarToast('⚠️ Bloqueado: Completa los datos de acceso al portal antes de activar.');
       this.nuevoAliado.update(al => ({ ...al, estado_operativo: 'Cerrado' }));
       return;
    }
    
    this.nuevoAliado.update(al => ({ ...al, estado_operativo: estado ? 'Abierto' : 'Cerrado' }));
  }


  // --- CRUD BASE Y MODALES ---
  getCategoriaInfo(id: number | null): { nombre: string, icono: string } {
    const cat = this.categorias().find(c => c.id === id);
    return cat ? { nombre: cat.nombre, icono: cat.icono || '🏷️' } : { nombre: 'Sin Categoría', icono: '❓' };
  }

  getZonaNombre(id: number | null): string {
    const zona = this.zonas().find(z => z.id === id);
    return zona ? zona.nombre : 'Fuera de Cobertura';
  }

  abrirModalCrear(lat: number = 6.3373, lng: number = -75.5579) {
    this.editandoId.set(null);
    this.imagenPreview.set(null);
    this.nuevoAliado.set({ nombre: '', direccion: 'Buscando...', latitud: lat, longitud: lng, categoria_id: null, zona_id: null, estado_operativo: 'Cerrado', correo_contacto: '', telefono_contacto: '', logo_url: '' });
    this.modalAbierto.set(true);
    this.obtenerDireccionAutomatica(lat, lng);
    setTimeout(() => this.initMiniMap(lat, lng), 150);
  }

  abrirModalEditar(aliado: Aliado) {
    this.editandoId.set(aliado.id!);
    this.imagenPreview.set(aliado.logo_url || null);
    this.nuevoAliado.set({ ...aliado });
    this.modalAbierto.set(true);
    setTimeout(() => this.initMiniMap(aliado.latitud || 6.3373, aliado.longitud || -75.5579), 150);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
    if (this.miniMap) { this.miniMap.remove(); this.miniMap = null; }
  }

  guardarAliado() {
    if (!this.formularioValido()) return;
    const data = this.nuevoAliado();
    
    data.correo_contacto = data.correo_contacto?.trim() || '';
    data.telefono_contacto = data.telefono_contacto?.trim() || '';
    
    const faltaInfo = !data.correo_contacto || !data.telefono_contacto;
    
    if (data.estado_operativo === 'Abierto' && faltaInfo) {
      data.estado_operativo = 'Cerrado';
      this.mostrarToast('⚠️ Se cambió a Cerrado. Faltan credenciales del portal.');
    }

    if (this.editandoId()) {
      const original = this.aliados().find(a => a.id === this.editandoId());
      const teniaCorreo = original ? !!original.correo_contacto : false;
      const tieneCorreoAhora = !!data.correo_contacto;
      const esPrimeraVez = !teniaCorreo && tieneCorreoAhora;

      this.adminService.updateAliado(this.editandoId()!, data).subscribe({
        next: () => {
          if (!faltaInfo && esPrimeraVez) {
            this.adminService.notificarAliado(this.editandoId()!).subscribe();
            this.mostrarToast(`🎉 Acceso de Portal enviado a ${data.correo_contacto}.`);
            this.lanzarCelebracion();
          } else {
            this.mostrarToast('✅ Comercio actualizado con éxito.');
          }
          this.cargarDatos();
          this.cerrarModal();
        },
        error: () => this.mostrarToast('❌ Error al actualizar.')
      });
    } else {
      this.adminService.createAliado(data).subscribe({
        next: (res) => {
          if (!faltaInfo && res.id) {
             this.adminService.notificarAliado(res.id).subscribe();
             this.mostrarToast(`🎉 Nuevo Aliado creado. Acceso enviado a ${data.correo_contacto}`);
             this.lanzarCelebracion();
          } else {
             this.mostrarToast('🎉 Nuevo Aliado creado. Falta configurar su portal.');
          }
          this.cargarDatos();
          this.cerrarModal();
        },
        error: () => this.mostrarToast('❌ Error al crear el aliado.')
      });
    }
  }

  eliminarAliado(aliado: Aliado) {
    if (confirm(`⚠️ ¿Deseas eliminar permanentemente al comercio "${aliado.nombre}" y todo su catálogo?`)) {
      if (aliado.logo_url && aliado.logo_url.includes('cloudinary')) this.adminService.deleteImagen(aliado.logo_url).subscribe(); 
      this.adminService.deleteAliado(aliado.id!).subscribe({
        next: () => { this.mostrarToast(`🗑️ Comercio eliminado.`); this.cargarDatos(); },
        error: () => this.mostrarToast('❌ Error al eliminar.')
      });
    }
  }

  notificarContacto(aliado: Aliado, event: Event) {
    event.stopPropagation();
    if (!aliado.id || !aliado.correo_contacto) {
       this.mostrarToast(`⚠️ El aliado debe tener un correo configurado primero.`);
       return;
    }
    this.mostrarToast(`📧 Conectando con el servidor para reenviar credenciales a ${aliado.correo_contacto}...`);
    this.adminService.notificarAliado(aliado.id).subscribe({
       next: () => this.mostrarToast(`✅ Enlace de gestión de catálogo enviado con éxito.`),
       error: () => this.mostrarToast(`❌ Error de servidor al enviar el correo.`)
    });
  }

  // --- OPTIMIZACIÓN IMÁGENES CLOUDINARY ---
  async onImagenSeleccionada(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const urlAntigua = this.nuevoAliado().logo_url;
      const reader = new FileReader();
      reader.onload = () => this.imagenPreview.set(reader.result as string);
      reader.readAsDataURL(file);

      this.subiendoImagen.set(true);
      this.toastMessage.set('⚙️ Optimizando logo a WebP...');

      try {
        const archivoOptimizado = await this.comprimirImagenProfesional(file, 800, 800, 0.85);
        this.adminService.uploadImagen(archivoOptimizado).subscribe({
          next: (res) => {
            const urlFinal = res.url.replace('/upload/', '/upload/q_auto,f_auto/');
            if (urlAntigua && urlAntigua.includes('cloudinary')) this.adminService.deleteImagen(urlAntigua).subscribe();
            this.nuevoAliado.update(a => ({ ...a, logo_url: urlFinal }));
            this.subiendoImagen.set(false);
            this.mostrarToast('✅ Logo guardado.');
          },
          error: () => { this.subiendoImagen.set(false); this.imagenPreview.set(urlAntigua || null); this.mostrarToast('❌ Error subiendo logo.'); }
        });
      } catch { this.subiendoImagen.set(false); this.imagenPreview.set(urlAntigua || null); this.mostrarToast('❌ Error comprimiendo la imagen.'); }
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

  mostrarTooltip(e: MouseEvent, texto: string) {
    const target = e.currentTarget as HTMLElement; const rect = target.getBoundingClientRect();
    const tooltip = document.createElement('div'); tooltip.id = 'global-tooltip';
    tooltip.textContent = texto; tooltip.style.cssText = `position:fixed;background:rgba(15,23,42,0.95);backdrop-filter:blur(4px);color:#f8fafc;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:600;z-index:999999;border:1px solid rgba(255,255,255,0.1);pointer-events:none;`;
    document.body.appendChild(tooltip);
    tooltip.style.left = `${Math.max(10, rect.left + (rect.width/2) - (tooltip.getBoundingClientRect().width/2))}px`;
    tooltip.style.top = `${rect.top - tooltip.getBoundingClientRect().height - 8}px`;
  }
  ocultarTooltip() { document.getElementById('global-tooltip')?.remove(); }

  descargarQR(aliado: Aliado, e: Event) {
    e.stopPropagation();
    if (!aliado.qr_access_token) return;
    const urlDestino = `https://airbnb-delivery-frontend.vercel.app/partner/${aliado.qr_access_token}`;
    fetch(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(urlDestino)}&color=0f172a&bgcolor=ffffff`).then(r => r.blob()).then(b => {
      const a = document.createElement('a'); a.href = window.URL.createObjectURL(b); a.download = `QR_Aliado_${aliado.nombre.replace(/\s+/g,'_')}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
  }

  centrarEnMapa(a: Aliado) { if(a.latitud && a.longitud) this.map.flyTo([a.latitud, a.longitud], 17, {duration: 1.5}); }
  actualizarFiltro(e: any) { this.filtroTexto.set(e.target.value); }
  mostrarToast(msg: string) { this.toastMessage.set(msg); setTimeout(() => this.toastMessage.set(null), 4000); }
}
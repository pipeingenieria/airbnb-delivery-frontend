import { Component, inject, OnInit, signal, computed, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';
import { Propiedad, PropiedadBatchCreate, Zona } from '../../../../models/admin.models';
import * as L from 'leaflet';

@Component({
  selector: 'app-propiedades-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './propiedades-list.html'
})
export class PropiedadesList implements OnInit, AfterViewInit {
  private adminService = inject(AdminService);

  propiedades = signal<Propiedad[]>([]);
  zonasActivas = signal<Zona[]>([]);
  cargando = signal<boolean>(true);
  
  busquedaDireccion = signal<string>('');
  modalAbierto = signal<boolean>(false);
  editandoId = signal<number | null>(null);
  
  // MODO EDIFICIO Y UPLOAD
  esEdificio = signal<boolean>(false);
  listaAptos = signal<string[]>([]);
  aptoInput = signal<string>('');
  imagenPreview = signal<string | null>(null);
  
  zonasQueCubren = signal<Zona[]>([]);

  nuevaPropiedad = signal<Propiedad & { imagen_url?: string }>({
    nombre: '',
    direccion_apto: '',
    activo: true,
    latitud: 6.3373, 
    longitud: -75.5579,
    zonas_ids: []
  });

  // VALIDACIONES MÁS FLEXIBLES Y PROFESIONALES
  esDireccionValida = computed(() => {
    const dir = (this.nuevaPropiedad().direccion_apto || '').trim();
    return dir.length >= 5; // Validación limpia y sin bloqueos molestos
  });

  formularioValido = computed(() => {
    const prop = this.nuevaPropiedad();
    if (!prop.nombre || prop.nombre.trim() === '') return false;
    if (!this.esDireccionValida()) return false;
    if (this.esEdificio() && this.listaAptos().length === 0 && !this.editandoId()) return false;
    if (this.zonasQueCubren().length === 0) return false;
    return true;
  });

  // PAGINACIÓN Y FILTROS
  filtroLista = signal<string>('');
  paginaActual = signal<number>(1);
  itemsPorPagina = 4;

  propiedadesFiltradas = computed(() => {
    const term = this.filtroLista().toLowerCase().trim();
    if (!term) return this.propiedades();
    return this.propiedades().filter(p => 
      p.nombre.toLowerCase().includes(term) || 
      (p.direccion_apto && p.direccion_apto.toLowerCase().includes(term))
    );
  });

  totalPaginas = computed(() => Math.ceil(this.propiedadesFiltradas().length / this.itemsPorPagina) || 1);
  propiedadesPaginadas = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.itemsPorPagina;
    return this.propiedadesFiltradas().slice(inicio, inicio + this.itemsPorPagina);
  });

  private map!: L.Map;
  private markersLayer = L.layerGroup();
  private miniMap: L.Map | null = null;
  private miniMapMarker: L.Marker | null = null;
  private zonasLayersLayer = L.layerGroup(); 

  ngOnInit() {
    this.cargarDatos();
  }

  ngAfterViewInit() {
    this.initMainMap();
  }

  cargarDatos() {
    this.cargando.set(true);
    this.adminService.getZonas().subscribe({
      next: (zonas) => {
        this.zonasActivas.set(zonas);
        this.adminService.getPropiedades().subscribe({
          next: (props) => {
            this.propiedades.set(props);
            this.actualizarMarcadoresEnMapa();
            this.cargando.set(false);
          },
          error: (err) => { console.error(err); this.cargando.set(false); }
        });
      },
      error: (err) => { console.error(err); this.cargando.set(false); }
    });
  }

  // ==========================================
  // MAPA PRINCIPAL Y POPUPS INTERACTIVOS
  // ==========================================
  initMainMap() {
    if (this.map) this.map.remove();
    this.map = L.map('propiedades-map', { zoomControl: false, preferCanvas: true, wheelDebounceTime: 150 }).setView([6.3373, -75.5579], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, keepBuffer: 6, updateWhenIdle: false }).addTo(this.map);
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

    const grupos = new Map<string, Propiedad[]>();
    this.propiedades().forEach(p => {
      if (p.latitud && p.longitud) {
        const key = `${p.latitud},${p.longitud}`;
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key)!.push(p);
      }
    });

    const pinIcon = L.divIcon({ className: 'custom-property-pin', html: `<div style="background-color: #3b82f6; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 10px #3b82f6;"></div>`, iconSize: [14, 14] });
    const edificioIcon = L.divIcon({ className: 'custom-building-pin', html: `<div style="background-color: #8b5cf6; width: 18px; height: 18px; border-radius: 4px; border: 2px solid #fff; box-shadow: 0 0 12px #8b5cf6; display:flex; align-items:center; justify-content:center;"><span style="color:white; font-size:9px; font-weight:bold;">E</span></div>`, iconSize: [18, 18] });

    grupos.forEach((props, coords) => {
      const [lat, lng] = coords.split(',').map(Number);
      const esEdificio = props.length > 1;
      const marker = L.marker([lat, lng], { icon: esEdificio ? edificioIcon : pinIcon });
      
      marker.on('click', (e: any) => L.DomEvent.stopPropagation(e));
      
      const customImg = (props[0] as any).imagen_url;
      const placeholderHtml = esEdificio 
        ? `<div style="width:100%; height:100%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#94a3b8;"><svg style="width:32px;height:32px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg></div>`
        : `<div style="width:100%; height:100%; background:#1e293b; display:flex; align-items:center; justify-content:center; color:#94a3b8;"><svg style="width:32px;height:32px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg></div>`;

      const mediaContent = customImg 
        ? `<img src="${customImg}" style="width: 100%; height: 100%; object-fit: cover;">`
        : placeholderHtml;

      let popupHtml = `
        <div class="leaflet-interactive-popup" style="font-family: sans-serif; text-align: center; width: 160px; cursor: pointer; padding-top: 4px;">
          <div style="width: 100%; height: 95px; border-radius: 8px; overflow: hidden; margin-bottom: 8px; border: 1px solid #334155; background: #0f172a;">
            ${mediaContent}
          </div>
          <strong style="color: #f8fafc; font-size: 13px;">${esEdificio ? `Edificio (${props.length} Aptos)` : props[0].nombre}</strong><br>
          <span style="color: #94a3b8; font-size: 11px; line-height: 1.2; display: block; margin-top: 2px;">${esEdificio ? `Ej: ${props[0].nombre}` : (props[0].direccion_apto || 'Sin detalle')}</span>
          <div style="background-color: #1e3a8a; border: 1px solid #3b82f6; color: #93c5fd; font-size: 9px; font-weight: bold; margin-top: 6px; padding: 3px; border-radius: 4px; text-transform: uppercase;">Doble clic para editar</div>
        </div>
      `;
      
      marker.bindPopup(popupHtml);

      marker.on('popupopen', (e: any) => {
        const popupNode = e.popup.getElement();
        if (popupNode) {
          popupNode.addEventListener('dblclick', (ev: MouseEvent) => {
            ev.stopPropagation();
            if (esEdificio) alert('📍 Este pin contiene múltiples apartamentos. Para editar uno específico, búscalo en el panel lateral de la derecha.');
            else this.editarPropiedad(props[0]);
          });
        }
      });
      
      marker.on('dblclick', (e: any) => {
        L.DomEvent.stopPropagation(e);
        if (esEdificio) alert('📍 Este pin contiene múltiples apartamentos. Para editar uno específico, búscalo en el panel lateral de la derecha.');
        else this.editarPropiedad(props[0]);
      });

      this.markersLayer.addLayer(marker);
    });
  }

  // ==========================================
  // GESTOR GRÁFICO DE APARTAMENTOS
  // ==========================================
  agregarApto() {
    const val = this.aptoInput().trim();
    if (val && !this.listaAptos().includes(val)) {
      this.listaAptos.update(list => [...list, val]);
      this.aptoInput.set('');
    }
  }

  removerApto(apto: string) {
    this.listaAptos.update(list => list.filter(a => a !== apto));
  }

  // ==========================================
  // UPLOADER DE IMAGEN
  // ==========================================
  onImagenSeleccionada(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.imagenPreview.set(reader.result as string);
        this.nuevaPropiedad.update(p => ({ ...p, imagen_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  }

  // ==========================================
  // RADAR ESPACIAL Y MINIMAPA (CON RECALCULO DE TAMAÑO)
  // ==========================================
  initMiniMap(lat: number, lng: number) {
    if (this.miniMap) this.miniMap.remove();
    
    this.miniMap = L.map('minimap', { zoomControl: false, preferCanvas: true, wheelDebounceTime: 150 }).setView([lat, lng], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(this.miniMap);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { keepBuffer: 6, updateWhenIdle: false }).addTo(this.miniMap);
    this.zonasLayersLayer.addTo(this.miniMap);

    const pinIcon = L.divIcon({ className: 'custom-map-pin', html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 15px #3b82f6;"></div>`, iconSize: [16, 16] });
    this.miniMapMarker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(this.miniMap);
    
    this.calcularCobertura(lat, lng);

    this.miniMapMarker.on('drag', (e) => {
      const position = e.target.getLatLng();
      this.calcularCobertura(position.lat, position.lng);
    });

    this.miniMapMarker.on('dragend', (e) => {
      const position = e.target.getLatLng();
      this.nuevaPropiedad.update(p => ({ ...p, latitud: position.lat, longitud: position.lng }));
      this.obtenerDireccionAutomatica(position.lat, position.lng);
    });

    // CORRECCIÓN CRÍTICA: Forzar renderizado completo del mapa cuando el modal abre
    setTimeout(() => {
      this.miniMap?.invalidateSize();
    }, 250);
  }

  calcularCobertura(lat: number, lng: number) {
    if (!this.miniMap) return;
    this.zonasLayersLayer.clearLayers();
    const pinLatLng = L.latLng(lat, lng);
    const zonasIntersectadas: Zona[] = [];

    this.zonasActivas().forEach(zona => {
      if (zona.latitud && zona.longitud && zona.radio) {
        const zonaLatLng = L.latLng(Number(zona.latitud), Number(zona.longitud));
        if (pinLatLng.distanceTo(zonaLatLng) <= Number(zona.radio)) {
          zonasIntersectadas.push(zona);
          L.circle(zonaLatLng, { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.15, radius: zona.radio }).addTo(this.zonasLayersLayer);
        }
      }
    });
    
    this.zonasQueCubren.set(zonasIntersectadas);
    this.nuevaPropiedad.update(p => ({ ...p, zonas_ids: zonasIntersectadas.map(z => z.id!) }));
  }

  async obtenerDireccionAutomatica(lat: number, lng: number) {
    try {
      this.nuevaPropiedad.update(p => ({ ...p, direccion_apto: 'Calculando ubicación...' }));
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await response.json();
      
      if (data && data.address) {
        const road = data.address.road || data.address.pedestrian || '';
        const suburb = data.address.suburb || data.address.neighbourhood || '';
        const city = data.address.city || data.address.town || 'Bello';
        const direccionFinal = [road, suburb, city].filter(Boolean).join(', ');
        
        this.nuevaPropiedad.update(p => ({ ...p, direccion_apto: direccionFinal }));
      }
    } catch (error) {
      this.nuevaPropiedad.update(p => ({ ...p, direccion_apto: 'Ubicación seleccionada' }));
    }
  }

  // ==========================================
  // MODAL Y CRUD
  // ==========================================
  abrirModalCrear(lat: number = 6.3373, lng: number = -75.5579) {
    this.editandoId.set(null);
    this.esEdificio.set(false);
    this.listaAptos.set([]);
    this.aptoInput.set('');
    this.imagenPreview.set(null);
    this.nuevaPropiedad.set({ nombre: '', direccion_apto: 'Buscando...', activo: true, latitud: lat, longitud: lng, zonas_ids: [] });
    this.modalAbierto.set(true);
    
    this.obtenerDireccionAutomatica(lat, lng);
    setTimeout(() => this.initMiniMap(lat, lng), 150);
  }

  editarPropiedad(prop: Propiedad, event?: Event) {
    if (event) event.stopPropagation();
    
    this.editandoId.set(prop.id || null);
    this.esEdificio.set(false);
    this.imagenPreview.set((prop as any).imagen_url || null);
    
    const lat = Number(prop.latitud) || 6.3373;
    const lng = Number(prop.longitud) || -75.5579;

    this.nuevaPropiedad.set({ ...prop, latitud: lat, longitud: lng, zonas_ids: prop.zonas_ids || [] });
    this.modalAbierto.set(true);
    setTimeout(() => this.initMiniMap(lat, lng), 150);
  }

  eliminarPropiedad(prop: Propiedad, event: Event) {
    event.stopPropagation();
    if (confirm(`¿Estás completamente seguro de eliminar la propiedad "${prop.nombre}"?`)) {
      if (prop.id) {
        this.adminService.deletePropiedad(prop.id).subscribe({ next: () => this.cargarDatos(), error: () => alert('Error.') });
      }
    }
  }

  cerrarModal() {
    this.modalAbierto.set(false);
    this.editandoId.set(null);
    if (this.miniMap) { this.miniMap.remove(); this.miniMap = null; }
  }

  guardarDatos() {
    if (!this.formularioValido()) return;

    if (!this.esEdificio() || this.editandoId()) {
      const propData = this.nuevaPropiedad();
      if (this.editandoId()) {
        this.adminService.updatePropiedad(this.editandoId()!, propData).subscribe({ next: () => { this.cargarDatos(); this.cerrarModal(); } });
      } else {
        this.adminService.createPropiedad(propData).subscribe({ next: () => { this.cargarDatos(); this.cerrarModal(); } });
      }
    } else {
      const batchData: PropiedadBatchCreate = {
        nombre_edificio: this.nuevaPropiedad().nombre,
        latitud: this.nuevaPropiedad().latitud!,
        longitud: this.nuevaPropiedad().longitud!,
        apartamentos: this.listaAptos(),
        zonas_ids: this.nuevaPropiedad().zonas_ids || [],
        imagen_url: this.nuevaPropiedad().imagen_url
      } as any;

      this.adminService.createPropiedadBatch(batchData).subscribe({
        next: (res) => { alert(res.mensaje); this.cargarDatos(); this.cerrarModal(); }
      });
    }
  }

  // ==========================================
  // UTILIDADES
  // ==========================================
  centrarEnPropiedad(prop: Propiedad) {
    if (prop.latitud && prop.longitud) this.map.flyTo([prop.latitud, prop.longitud], 17, { duration: 1.5 });
  }

  async buscarEnMapa() {
    const query = this.busquedaDireccion();
    if (!query || query.trim() === '') return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Antioquia, Colombia')}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) this.map.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16, { duration: 1.5 });
    } catch (e) { }
  }

  async buscarDireccionModal() {
    const query = this.nuevaPropiedad().direccion_apto;
    if (!query) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Antioquia, Colombia')}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        this.nuevaPropiedad.update(p => ({ ...p, latitud: lat, longitud: lng }));
        if (this.miniMap) this.miniMap.flyTo([lat, lng], 16);
        if (this.miniMapMarker) this.miniMapMarker.setLatLng([lat, lng]);
        this.calcularCobertura(lat, lng);
      }
    } catch (e) { }
  }

  actualizarFiltroLista(e: any) { this.filtroLista.set(e.target.value); this.paginaActual.set(1); }
  paginaAnterior() { if (this.paginaActual() > 1) this.paginaActual.update(p => p - 1); }
  paginaSiguiente() { if (this.paginaActual() < this.totalPaginas()) this.paginaActual.update(p => p + 1); }
}
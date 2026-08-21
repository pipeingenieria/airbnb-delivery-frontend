import { Component, inject, OnInit, signal, computed, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';
import { Zona } from '../../../../models/admin.models';
import * as L from 'leaflet';

@Component({
  selector: 'app-zonas-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zonas-list.html'
})
export class ZonasList implements OnInit, AfterViewInit {
  private adminService: AdminService = inject(AdminService);

  zonas = signal<Zona[]>([]);
  cargando = signal<boolean>(true);
  
  busquedaDireccion = signal<string>('');
  modalAbierto = signal<boolean>(false);
  editandoId = signal<number | null>(null); 
  
  nuevaZona = signal<Zona>({
    nombre: '',
    ciudad: 'Buscando...',
    activo: true,
    latitud: 6.3373,
    longitud: -75.5579,
    radio: 1000 
  });

  // NUEVAS SEÑALES PARA PUNTOS DE INTERÉS
  propiedadesBD = signal<any[]>([]);
  aliadosBD = signal<any[]>([]);
  categoriasBD = signal<any[]>([]);

  // ESTADO PARA FILTRO Y PAGINACIÓN
  filtroLista = signal<string>('');
  paginaActual = signal<number>(1);
  itemsPorPagina = 4;

  zonasFiltradas = computed(() => {
    const term = this.filtroLista().toLowerCase().trim();
    if (!term) return this.zonas();
    return this.zonas().filter(z => 
      z.nombre.toLowerCase().includes(term) || 
      z.ciudad.toLowerCase().includes(term)
    );
  });

  totalPaginas = computed(() => {
    return Math.ceil(this.zonasFiltradas().length / this.itemsPorPagina) || 1;
  });

  zonasPaginadas = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.zonasFiltradas().slice(inicio, fin);
  });

  // MAPAS Y CAPAS
  private map!: L.Map;
  private markersLayer = L.layerGroup(); 
  private detallesLayer = L.layerGroup(); 
  
  private miniMap: L.Map | null = null;
  private miniMapMarker: L.Marker | null = null;
  private miniMapCircle: L.Circle | null = null;

  ngOnInit() {
    this.cargarZonas();
    this.cargarElementosMapa(); 
  }

  ngAfterViewInit() {
    this.initMainMap();
  }

  initMainMap() {
    if (this.map) {
      this.map.remove();
    }
    
    this.map = L.map('geocercas-map', { 
      zoomControl: false,
      preferCanvas: true,
      wheelDebounceTime: 150
    }).setView([6.3373, -75.5579], 12);
    
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
      keepBuffer: 6,
      updateWhenIdle: false,
      updateWhenZooming: false
    }).addTo(this.map);

    this.markersLayer.addTo(this.map);

    // EVENTO DE ZOOM: Ajustado a 12.5 para que los iconos aparezcan desde más lejos
    this.map.on('zoomend', () => {
      const zoomActual = this.map.getZoom();
      if (zoomActual >= 12.5) { 
        if (!this.map.hasLayer(this.detallesLayer)) {
          this.map.addLayer(this.detallesLayer);
        }
      } else {
        if (this.map.hasLayer(this.detallesLayer)) {
          this.map.removeLayer(this.detallesLayer);
        }
      }
    });

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.abrirModalCrear(e.latlng.lat, e.latlng.lng);
    });

    setTimeout(() => {
      this.map.invalidateSize();
      this.actualizarMarcadoresEnMapa(); 
    }, 200);
  }

  cargarElementosMapa() {
    this.adminService.getPropiedades().subscribe({
      next: (data) => { this.propiedadesBD.set(data); this.actualizarDetallesMapa(); },
      error: () => console.error("No se pudieron cargar las propiedades")
    });

    this.adminService.getAliados().subscribe({
      next: (data) => { this.aliadosBD.set(data); this.actualizarDetallesMapa(); },
      error: () => console.error("No se pudieron cargar los aliados")
    });

    this.adminService.getCategorias().subscribe({
      next: (data) => { this.categoriasBD.set(data); this.actualizarDetallesMapa(); },
      error: () => console.error("No se pudieron cargar las categorias")
    });
  }

  actualizarDetallesMapa() {
    this.detallesLayer.clearLayers();

    const iconoPropiedad = L.divIcon({
      className: 'bg-transparent border-0',
      html: `<div style="width: 28px; height: 28px; background: #6366f1; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); color: white;">
               <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
             </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });

    const iconoAliado = L.divIcon({
      className: 'bg-transparent border-0',
      html: `<div style="width: 28px; height: 28px; background: #f43f5e; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); color: white;">
               <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
             </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });

    this.propiedadesBD().forEach(prop => {
      if (prop.latitud && prop.longitud) {
        const marker = L.marker([prop.latitud, prop.longitud], { icon: iconoPropiedad });
        marker.bindPopup(`
          <div style="font-family: sans-serif; text-align: center; min-width: 120px;">
            <strong style="color: #0f172a; font-size: 13px;">${prop.nombre}</strong><br>
            <span style="color: #6366f1; font-size: 11px; font-weight: bold;">🏢 Propiedad Be-Nest</span>
          </div>
        `);
        this.detallesLayer.addLayer(marker);
      }
    });

    // Inyectar Aliados al Layer
    this.aliadosBD().forEach(aliado => {
      if (aliado.latitud && aliado.longitud) {
        
        // 1. Buscar la info de la categoría
        const cat = this.categoriasBD().find(c => c.id === aliado.categoria_id);
        const nombreCat = cat ? cat.nombre : 'Socio Comercial';
        const iconoCat = cat ? (cat.icono || '🏪') : '🏪';

        // 2. Crear el ÍCONO DINÁMICO leyendo el emoji de la categoría con borde oscuro
        const iconoAliadoDinamico = L.divIcon({
          className: 'bg-transparent border-0',
          html: `<div style="width: 28px; height: 28px; background: #f43f5e; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); color: white; font-size: 14px; line-height: 1;">
                   <span style="text-shadow: -1px -1px 0 rgba(15,23,42,0.9), 1px -1px 0 rgba(15,23,42,0.9), -1px 1px 0 rgba(15,23,42,0.9), 1px 1px 0 rgba(15,23,42,0.9);">${iconoCat}</span>
                 </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14]
        });

        // 3. Asignar el marcador con el nuevo ícono dinámico
        const marker = L.marker([aliado.latitud, aliado.longitud], { icon: iconoAliadoDinamico });
        
        marker.bindPopup(`
          <div style="font-family: sans-serif; text-align: center; min-width: 120px;">
            <strong style="color: #0f172a; font-size: 13px;">${aliado.nombre}</strong><br>
            <span style="color: #f43f5e; font-size: 11px; font-weight: bold;">${iconoCat} ${nombreCat}</span>
          </div>
        `);
        this.detallesLayer.addLayer(marker);
      }
    });
  }

  actualizarMarcadoresEnMapa() {
    if (!this.map) return;
    this.markersLayer.clearLayers();

    this.zonas().forEach((zona) => {
      const lat = Number(zona.latitud);
      const lng = Number(zona.longitud);
      
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        const radio = Number(zona.radio) || 1000;

        const circle = L.circle([lat, lng], {
          color: '#10b981', 
          fillOpacity: 0.45, // <-- CÁMBIALO A 0.35 (o 0.4 si lo quieres más fuerte)
          weight: 4,
          radius: radio
        });

        circle.on('click', (e: any) => { L.DomEvent.stopPropagation(e); });
        circle.on('dblclick', (e: any) => {
          L.DomEvent.stopPropagation(e);
          this.editarZona(zona); 
        });

        circle.bindPopup(`
          <div style="font-family: sans-serif; text-align: center;">
            <strong style="color: #0f172a; font-size: 14px;">${zona.nombre}</strong><br>
            <span style="color: #64748b; font-size: 12px;">Cobertura: ${radio}m</span><br>
            <span style="color: #10b981; font-size: 10px; font-weight: bold; margin-top: 4px; display: block;">(Doble clic para editar)</span>
          </div>
        `);
        
        this.markersLayer.addLayer(circle);
      }
    });
  }

  cargarZonas() {
    this.cargando.set(true);
    this.adminService.getZonas().subscribe({
      next: (data) => {
        this.zonas.set(data);
        this.cargando.set(false);
        this.actualizarMarcadoresEnMapa();
      },
      error: (err: any) => {
        console.error('Error al cargar zonas:', err);
        this.cargando.set(false);
      }
    });
  }

  actualizarFiltroLista(event: any) {
    this.filtroLista.set(event.target.value);
    this.paginaActual.set(1);
  }

  paginaAnterior() {
    if (this.paginaActual() > 1) {
      this.paginaActual.update(p => p - 1);
    }
  }

  paginaSiguiente() {
    if (this.paginaActual() < this.totalPaginas()) {
      this.paginaActual.update(p => p + 1);
    }
  }

  centrarEnZona(zona: Zona) {
    const lat = Number(zona.latitud);
    const lng = Number(zona.longitud);
    
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      this.map.flyTo([lat, lng], 16, { duration: 1.5 });
    } else {
      alert(`La zona "${zona.nombre}" no tiene coordenadas asignadas en la Base de Datos. Por favor, dale clic a Editar (el lápiz) y ubícala en el mapa.`);
    }
  }

  editarZona(zona: Zona, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.editandoId.set(zona.id || null);
    
    const lat = Number(zona.latitud) || 6.3373;
    const lng = Number(zona.longitud) || -75.5579;

    this.nuevaZona.set({
      ...zona,
      latitud: lat,
      longitud: lng,
      radio: Number(zona.radio) || 1000
    });
    
    this.modalAbierto.set(true);
    setTimeout(() => this.initMiniMap(lat, lng), 150);
  }

  eliminarZona(zona: Zona, event: Event) {
    event.stopPropagation();
    if (confirm(`¿Estás completamente seguro de eliminar la zona "${zona.nombre}"? Esto dejará sin cobertura a los edificios asociados.`)) {
      if (zona.id) {
        this.adminService.deleteZona(zona.id).subscribe({
          next: () => {
            this.cargarZonas();
          },
          error: (err: any) => alert('Error al eliminar la zona.')
        });
      }
    }
  }

  async buscarEnMapa() {
    const query = this.busquedaDireccion();
    if (!query || query.trim() === '') return;

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Antioquia, Colombia')}&limit=1`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        this.map.flyTo([lat, lng], 16, { duration: 1.5 });
      } else {
        alert('No pudimos ubicar esa dirección. Intenta ser más específico.');
      }
    } catch (error) {
      console.error('Error en búsqueda:', error);
    }
  }

  async buscarDireccionModal() {
    const query = this.nuevaZona().ciudad;
    if (!query || query.trim() === '') return;

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Antioquia, Colombia')}&limit=1`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        
        this.nuevaZona.update(z => ({ ...z, latitud: lat, longitud: lng }));
        
        if (this.miniMap) this.miniMap.flyTo([lat, lng], 15, { duration: 1 });
        if (this.miniMapMarker) this.miniMapMarker.setLatLng([lat, lng]);
        if (this.miniMapCircle) this.miniMapCircle.setLatLng([lat, lng]);
        
      } else {
        alert('No pudimos ubicar esa dirección. Intenta agregar el barrio o municipio.');
      }
    } catch (error) {
      console.error('Error en búsqueda del modal:', error);
    }
  }

  async obtenerDireccionYNombre(lat: number, lng: number) {
    try {
      this.nuevaZona.update(z => ({ ...z, ciudad: 'Calculando ubicación...' }));
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await response.json();
      
      if (data && data.address) {
        const road = data.address.road || data.address.pedestrian || '';
        const suburb = data.address.suburb || data.address.neighbourhood || '';
        const city = data.address.city || data.address.town || 'Medellín / Bello';
        const direccionFinal = [road, suburb, city].filter(Boolean).join(', ');
        
        const latCentro = 6.2518;
        const lngCentro = -75.5635;
        let direccionCardinal = lat > latCentro + 0.02 ? 'Norte' : lat < latCentro - 0.02 ? 'Sur' : 'Centro';
        if (lng > lngCentro + 0.015) direccionCardinal += ' Oriente';
        else if (lng < lngCentro - 0.015) direccionCardinal += ' Occidente';

        const nombreSugerido = this.editandoId() ? this.nuevaZona().nombre : `${city.split(' ')[0]} ${direccionCardinal.trim()} ${Math.floor(Math.random() * 9) + 1}`;

        this.nuevaZona.update(z => ({ ...z, ciudad: direccionFinal, nombre: nombreSugerido }));
      }
    } catch (error) {
      this.nuevaZona.update(z => ({ ...z, ciudad: 'Ubicación seleccionada' }));
    }
  }

  abrirModalCrear(lat: number = 6.3373, lng: number = -75.5579) {
    this.editandoId.set(null);
    this.nuevaZona.set({ nombre: 'Calculando...', ciudad: 'Buscando...', activo: true, latitud: lat, longitud: lng, radio: 1000 });
    this.modalAbierto.set(true);
    this.obtenerDireccionYNombre(lat, lng);
    setTimeout(() => this.initMiniMap(lat, lng), 150);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
    this.editandoId.set(null);
    if (this.miniMap) {
      this.miniMap.remove();
      this.miniMap = null;
    }
  }

  initMiniMap(lat: number, lng: number) {
    if (this.miniMap) this.miniMap.remove();

    this.miniMap = L.map('minimap', { 
      zoomControl: false,
      preferCanvas: true,
      wheelDebounceTime: 150 
    }).setView([lat, lng], 14);
    
    L.control.zoom({ position: 'bottomright' }).addTo(this.miniMap);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
      keepBuffer: 6,
      updateWhenIdle: false,
      updateWhenZooming: false
    }).addTo(this.miniMap);

    const pinIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div style="background-color: #f43f5e; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 15px #f43f5e;"></div>`,
      iconSize: [16, 16]
    });

    this.miniMapMarker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(this.miniMap);
    
    this.miniMapCircle = L.circle([lat, lng], {
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.35, // <-- CÁMBIALO A 0.35
      weight: 4,
      radius: this.nuevaZona().radio
    }).addTo(this.miniMap);

    this.miniMapMarker.on('dragend', (e) => {
      const position = e.target.getLatLng();
      this.nuevaZona.update(z => ({ ...z, latitud: position.lat, longitud: position.lng }));
      this.miniMapCircle?.setLatLng(position);
      this.obtenerDireccionYNombre(position.lat, position.lng);
    });
  }

  actualizarRadio() {
    if (this.miniMapCircle) {
      this.miniMapCircle.setRadius(this.nuevaZona().radio || 1000);
    }
  }

  guardarZona() {
    const zonaData = this.nuevaZona();
    
    if (this.editandoId()) {
      this.adminService.updateZona(this.editandoId()!, zonaData).subscribe({
        next: () => {
          this.cargarZonas();
          this.cerrarModal();
        },
        error: (err: any) => console.error('Error al actualizar zona:', err)
      });
    } else {
      this.adminService.createZona(zonaData).subscribe({
        next: () => {
          this.cargarZonas();
          this.cerrarModal();
        },
        error: (err: any) => console.error('Error al crear zona:', err)
      });
    }
  }
}
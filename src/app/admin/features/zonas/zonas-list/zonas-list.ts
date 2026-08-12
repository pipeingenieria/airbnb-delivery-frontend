import { Component, inject, OnInit, signal, AfterViewInit } from '@angular/core';
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
  editandoId = signal<number | null>(null); // Para saber si estamos editando
  
  nuevaZona = signal<Zona>({
    nombre: '',
    ciudad: 'Buscando...',
    activo: true,
    latitud: 6.3373,
    longitud: -75.5579,
    radio: 1000 
  });

  private map!: L.Map;
  private markersLayer = L.layerGroup();
  
  private miniMap: L.Map | null = null;
  private miniMapMarker: L.Marker | null = null;
  private miniMapCircle: L.Circle | null = null;

  ngOnInit() {
    this.cargarZonas();
  }

  ngAfterViewInit() {
    this.initMainMap();
  }

  initMainMap() {
    if (this.map) {
      this.map.remove();
    }
    
    this.map = L.map('geocercas-map', { zoomControl: false }).setView([6.3373, -75.5579], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(this.map);

    this.markersLayer.addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.abrirModalCrear(e.latlng.lat, e.latlng.lng);
    });

    // FIX: Obligamos a que pinte los marcadores DESPUÉS de que el mapa exista físicamente
    setTimeout(() => {
      this.map.invalidateSize();
      this.actualizarMarcadoresEnMapa(); 
    }, 200);
  }

  // FIX: Validación para zonas antiguas sin coordenadas
  centrarEnZona(zona: Zona) {
    const lat = Number(zona.latitud);
    const lng = Number(zona.longitud);
    
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      this.map.flyTo([lat, lng], 15, { duration: 1.5 });
    } else {
      alert(`La zona "${zona.nombre}" no tiene coordenadas asignadas en la Base de Datos. Por favor, dale clic a Editar (el lápiz) y ubícala en el mapa.`);
    }
  }

  actualizarMarcadoresEnMapa() {
    if (!this.map) return;
    this.markersLayer.clearLayers();

    this.zonas().forEach((zona) => {
      // Parseo estricto a Number por si FastAPI manda los decimales como strings
      const lat = Number(zona.latitud);
      const lng = Number(zona.longitud);
      
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
        const radio = Number(zona.radio) || 1000;

        const circle = L.circle([lat, lng], {
          color: '#f43f5e',
          fillColor: '#f43f5e',
          fillOpacity: 0.2,
          radius: radio
        });

        circle.bindPopup(`
          <div style="font-family: sans-serif;">
            <strong style="color: #0f172a; font-size: 14px;">${zona.nombre}</strong><br>
            <span style="color: #64748b; font-size: 12px;">Cobertura: ${radio}m</span>
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
      error: (err) => {
        console.error('Error al cargar zonas:', err);
        this.cargando.set(false);
      }
    });
  }

  // --- NUEVAS FUNCIONES DE EXPERIENCIA (CENTRAR, EDITAR, ELIMINAR) ---
  
  // centrarEnZona(zona: Zona) {
  //   const lat = Number(zona.latitud);
  //   const lng = Number(zona.longitud);
  //   if (!isNaN(lat) && !isNaN(lng)) {
  //     this.map.flyTo([lat, lng], 15, { duration: 1.5 });
  //   }
  // }

  editarZona(zona: Zona, event: Event) {
    event.stopPropagation();
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
        // Asegúrate de tener deleteZona en tu AdminService
        this.adminService.deleteZona(zona.id).subscribe({
          next: () => {
            this.cargarZonas();
          },
          error: (err) => alert('Error al eliminar la zona.')
        });
      }
    }
  }

  // --- BUSCADOR Y LÓGICA DEL MAPA ---

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

    this.miniMap = L.map('minimap', { zoomControl: false }).setView([lat, lng], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(this.miniMap);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(this.miniMap);
    
    const pinIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div style="background-color: #f43f5e; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 15px #f43f5e;"></div>`,
      iconSize: [16, 16]
    });

    this.miniMapMarker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(this.miniMap);
    
    this.miniMapCircle = L.circle([lat, lng], {
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.2,
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
    
    // Si estamos editando usamos PUT, si no, POST
    if (this.editandoId()) {
      // Asegúrate de tener updateZona en tu AdminService
      this.adminService.updateZona(this.editandoId()!, zonaData).subscribe({
        next: () => {
          this.cargarZonas();
          this.cerrarModal();
        },
        error: (err) => console.error('Error al actualizar zona:', err)
      });
    } else {
      this.adminService.createZona(zonaData).subscribe({
        next: () => {
          this.cargarZonas();
          this.cerrarModal();
        },
        error: (err) => console.error('Error al crear zona:', err)
      });
    }
  }
}
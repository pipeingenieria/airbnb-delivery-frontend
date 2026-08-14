import { Component, inject, OnInit, signal, computed, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';
import { Propiedad, PropiedadBatchCreate, Zona } from '../../../../models/admin.models';
import * as L from 'leaflet';
import { forkJoin } from 'rxjs';

export interface GrupoPropiedad {
  id: string;
  esEdificio: boolean;
  nombrePrincipal: string;
  direccionBase: string;
  latitud: number;
  longitud: number;
  propiedades: Propiedad[];
  imagen_url: string | null;
  activo: boolean; 
  faltaContacto: boolean; 
}

export interface AptoUI {
  id?: number;
  nomenclatura: string;
  activo: boolean;
  airbnb_nombre?: string;
  airbnb_telefono?: string;
  airbnb_correo?: string;
  qr_access_token?: string;
}

@Component({
  selector: 'app-propiedades-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './propiedades-list.html'
})
export class PropiedadesList implements OnInit, AfterViewInit {
  private adminService = inject(AdminService);
  
  edificiosExpandidos = signal<Record<string, boolean>>({});

  toastMessage = signal<string | null>(null);
  ultimoAptoAgregado = signal<string | null>(null);
  aptosEliminando = signal<string[]>([]);

  modalContactoAbierto = signal<boolean>(false);
  aptoEnContacto = signal<AptoUI | null>(null);

  propiedades = signal<Propiedad[]>([]);
  zonasActivas = signal<Zona[]>([]);
  cargando = signal<boolean>(true);
  
  propiedadesActivasCount = computed(() => 
    this.propiedades().filter(p => p.activo && p.airbnb_nombre && p.airbnb_correo).length
  );

  busquedaDireccion = signal<string>('');
  modalAbierto = signal<boolean>(false);
  editandoId = signal<number | null>(null);
  
  esEdificio = signal<boolean>(false);
  listaAptos = signal<AptoUI[]>([]);
  aptoInput = signal<string>('');
  
  filtroLista = signal<string>('');
  filtroEstado = signal<'todos' | 'activos' | 'inactivos'>('todos');
  paginaActual = signal<number>(1);
  itemsPorPagina = 4;
  
  imagenPreview = signal<string | null>(null);
  propiedadesEdificioOriginal = signal<Propiedad[]>([]);
  zonasQueCubren = signal<Zona[]>([]);

  // Ya no necesitamos el parche porque el modelo Propiedad ya incluye imagen_url
  nuevaPropiedad = signal<Propiedad>({
    nombre: '',
    direccion_apto: '',
    activo: true, 
    latitud: 6.3373, 
    longitud: -75.5579,
    zonas_ids: [],
    airbnb_nombre: '',
    airbnb_telefono: '',
    airbnb_correo: '',
    imagen_url: null
  });

  esDireccionValida = computed(() => {
    const dir = (this.nuevaPropiedad().direccion_apto || '').toLowerCase().trim();
    const invalidos = ['buscando...', 'calculando ubicación...', 'ubicación seleccionada'];
    if (dir.length < 6 || invalidos.includes(dir)) return false;
    const tieneNumero = /\d/.test(dir);
    const tieneNomenclatura = /[#-]|apto|bloque|interior|mz|manzana|lote|torre|casa|local/i.test(dir);
    return tieneNumero && tieneNomenclatura;
  });

  formularioValido = computed(() => {
    const prop = this.nuevaPropiedad();
    if (!prop.nombre || prop.nombre.trim() === '') return false;
    if (!this.esDireccionValida()) return false;
    if (this.esEdificio() && this.listaAptos().length === 0 && !this.editandoId()) return false;
    if (this.zonasQueCubren().length === 0) return false;
    return true;
  });

  gruposPropiedades = computed<GrupoPropiedad[]>(() => {
    const map = new Map<string, Propiedad[]>();
    this.propiedades().forEach(p => {
      const key = (p.latitud && p.longitud) ? `${Number(p.latitud).toFixed(5)},${Number(p.longitud).toFixed(5)}` : `solo_${p.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });

    const result: GrupoPropiedad[] = [];
    map.forEach((props, key) => {
      const esEdificio = props.length > 1 || props.some(p => p.nombre.includes(' - Apto '));
      const pPrincipal = props.find(p => p.nombre.includes(' - Apto ')) || props[0];
      const nombreBase = esEdificio ? pPrincipal.nombre.split(' - Apto ')[0] : pPrincipal.nombre;
      const propsOrdenadas = props.sort((a,b) => b.nombre.localeCompare(a.nombre, undefined, { numeric: true, sensitivity: 'base' }));
      
      const grupoFaltaContacto = props.some(p => !p.airbnb_nombre || !p.airbnb_correo);

      result.push({
        id: key,
        esEdificio,
        nombrePrincipal: nombreBase,
        direccionBase: pPrincipal.direccion_apto || 'Sin Dirección',
        latitud: pPrincipal.latitud || 0,
        longitud: pPrincipal.longitud || 0,
        propiedades: propsOrdenadas,
        imagen_url: (pPrincipal as any).imagen_url || null,
        activo: props.some(p => p.activo),
        faltaContacto: grupoFaltaContacto
      });
    });
    return result.sort((a,b) => a.nombrePrincipal.localeCompare(b.nombrePrincipal));
  });

  gruposFiltrados = computed(() => {
    const term = this.filtroLista().toLowerCase().trim();
    const estado = this.filtroEstado();
    
    let filtrados = this.gruposPropiedades().map(grupo => {
      let propsFiltradas = grupo.propiedades;
      if (estado === 'activos') propsFiltradas = propsFiltradas.filter(p => p.activo !== false);
      else if (estado === 'inactivos') propsFiltradas = propsFiltradas.filter(p => p.activo === false);
      return { ...grupo, propiedades: propsFiltradas };
    }).filter(grupo => grupo.propiedades.length > 0);
    
    if (!term) return filtrados;
    return filtrados.filter(g => 
      g.nombrePrincipal.toLowerCase().includes(term) || 
      g.direccionBase.toLowerCase().includes(term) ||
      g.propiedades.some(p => (p.direccion_apto || '').toLowerCase().includes(term)) ||
      g.propiedades.some(p => (p.nombre || '').toLowerCase().includes(term))
    );
  });

  totalPaginas = computed(() => Math.ceil(this.gruposFiltrados().length / this.itemsPorPagina) || 1);
  gruposPaginados = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.itemsPorPagina;
    return this.gruposFiltrados().slice(inicio, inicio + this.itemsPorPagina);
  });

  private map!: L.Map;
  private markersLayer = L.layerGroup();
  private mainZonasLayer = L.layerGroup(); 
  private miniMap: L.Map | null = null;
  private miniMapMarker: L.Marker | null = null;
  private zonasLayersLayer = L.layerGroup(); 

  toggleEdificio(id: string, event: Event) {
    event.stopPropagation();
    this.edificiosExpandidos.update(state => ({ ...state, [id]: !state[id] }));
  }

  ngOnInit() { this.cargarDatos(); }
  ngAfterViewInit() { this.initMainMap(); }

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

  initMainMap() {
    if (this.map) this.map.remove();
    this.map = L.map('propiedades-map', { zoomControl: false, preferCanvas: true, wheelDebounceTime: 150 }).setView([6.3373, -75.5579], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, keepBuffer: 6, updateWhenIdle: false }).addTo(this.map);
    
    this.mainZonasLayer.addTo(this.map);
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

    this.zonasActivas().forEach(zona => {
      if (zona.latitud && zona.longitud && zona.radio) {
        L.circle([Number(zona.latitud), Number(zona.longitud)], {
          color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.15, radius: Number(zona.radio), interactive: false
        }).addTo(this.mainZonasLayer);
      }
    });

    this.gruposPropiedades().forEach(grupo => {
      const lat = grupo.latitud;
      const lng = grupo.longitud;
      if(!lat || !lng) return;

      const colorPin = grupo.activo ? '#3b82f6' : '#475569';
      const colorEdificio = grupo.activo ? '#8b5cf6' : '#475569';
      const borderStyle = grupo.activo ? 'border: 2px solid #fff;' : 'border: 2px dashed #94a3b8; opacity: 0.85;';
      const shadowStyle = grupo.activo ? `box-shadow: 0 0 10px ${colorPin};` : 'box-shadow: none;';

      const pinIcon = L.divIcon({ className: 'custom-property-pin', html: `<div style="background-color: ${colorPin}; width: 14px; height: 14px; border-radius: 50%; ${borderStyle} ${shadowStyle}"></div>`, iconSize: [14, 14] });
      const edificioIcon = L.divIcon({ className: 'custom-building-pin', html: `<div style="background-color: ${colorEdificio}; width: 18px; height: 18px; border-radius: 4px; ${borderStyle} ${shadowStyle} display:flex; align-items:center; justify-content:center;"><span style="color:white; font-size:9px; font-weight:bold;">E</span></div>`, iconSize: [18, 18] });

      const marker = L.marker([lat, lng], { icon: grupo.esEdificio ? edificioIcon : pinIcon });
      marker.on('click', (e: any) => L.DomEvent.stopPropagation(e));
      
      const placeholderHtml = grupo.esEdificio 
        ? `<div style="width:100%; height:100%; background: linear-gradient(145deg, #0f172a, #1e293b); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#64748b;"><svg style="width:36px;height:36px; margin-bottom:4px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg><span style="font-size:9px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#475569">Edificio</span></div>`
        : `<div style="width:100%; height:100%; background: linear-gradient(145deg, #0f172a, #1e293b); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#64748b;"><svg style="width:36px;height:36px; margin-bottom:4px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg><span style="font-size:9px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#475569">Propiedad</span></div>`;

      const mediaContent = grupo.imagen_url ? `<img src="${grupo.imagen_url}" style="width: 100%; height: 100%; object-fit: cover;">` : placeholderHtml;

      let popupHtml = `
        <div class="leaflet-interactive-popup" style="font-family: sans-serif; text-align: left; width: 140px; cursor: pointer; padding: 0;">
          <div style="width: 100%; height: 90px; border-radius: 10px 10px 0 0; overflow: hidden; position: relative; background: #0f172a;">
            ${mediaContent}
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(30,41,59,1), transparent); height: 25px;"></div>
          </div>
          <div style="padding: 8px; background: #1e293b; border-radius: 0 0 10px 10px;">
            <strong style="color: #f8fafc; font-size: 11px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${grupo.nombrePrincipal} ${!grupo.activo ? '(Inactivo)' : ''}</strong>
            <span style="color: #94a3b8; font-size: 9px; line-height: 1.2; display: block; margin-top: 2px;">${grupo.esEdificio ? `${grupo.propiedades.length} Apartamentos` : grupo.direccionBase}</span>
            <div style="display: flex; align-items: center; gap: 3px; margin-top: 6px;">
              <svg style="width: 9px; height: 9px; color: #3b82f6;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              <span style="color: #3b82f6; font-size: 8px; font-weight: bold; text-transform: uppercase;">Doble clic editar</span>
            </div>
          </div>
        </div>
      `;
      
      marker.bindPopup(popupHtml);
      marker.on('popupopen', (e: any) => {
        const popupNode = e.popup.getElement();
        if (popupNode) popupNode.addEventListener('dblclick', (ev: MouseEvent) => { ev.stopPropagation(); this.abrirEditorGrupo(grupo.propiedades); });
      });
      marker.on('dblclick', (e: any) => { L.DomEvent.stopPropagation(e); this.abrirEditorGrupo(grupo.propiedades); });
      this.markersLayer.addLayer(marker);
    });
  }

  // --- LÓGICA DE APARTAMENTOS Y EDICIÓN ---

  abrirEditorGrupo(props: Propiedad[], event?: Event) {
    if (event) event.stopPropagation();
    const esEdificio = props.length > 1 || props.some(p => p.nombre.includes(' - Apto '));
    const pPrincipal = props.find(p => p.nombre.includes(' - Apto ')) || props[0];
    const edificioActivo = props.some(p => p.activo !== false);

    if (esEdificio) {
      this.esEdificio.set(true);
      this.propiedadesEdificioOriginal.set(props);
      const nombreBase = pPrincipal.nombre.split(' - Apto ')[0] || pPrincipal.nombre;
      
      const aptosExtraidos: AptoUI[] = props.map(h => {
        const nom = h.nombre.includes(' - Apto ') ? h.nombre.split(' - Apto ')[1] : h.nombre;
        return { 
          id: h.id,
          nomenclatura: nom, 
          activo: h.activo !== undefined ? h.activo : false,
          airbnb_nombre: h.airbnb_nombre || '',
          airbnb_telefono: h.airbnb_telefono || '',
          airbnb_correo: h.airbnb_correo || '',
          qr_access_token: h.qr_access_token || ''
        };
      }).filter(a => a.nomenclatura);
      
      aptosExtraidos.sort((a, b) => b.nomenclatura.localeCompare(a.nomenclatura, undefined, { numeric: true, sensitivity: 'base' }));
      this.listaAptos.set(aptosExtraidos);
      
      this.editandoId.set(pPrincipal.id || 99999); 
      this.nuevaPropiedad.set({ ...pPrincipal, nombre: nombreBase, zonas_ids: pPrincipal.zonas_ids || [], activo: edificioActivo });
    } else {
      this.esEdificio.set(false);
      this.propiedadesEdificioOriginal.set([]);
      this.editandoId.set(pPrincipal.id || null);
      this.nuevaPropiedad.set({ 
        ...pPrincipal, 
        zonas_ids: pPrincipal.zonas_ids || [], 
        activo: pPrincipal.activo !== false,
        airbnb_nombre: pPrincipal.airbnb_nombre || '',
        airbnb_telefono: pPrincipal.airbnb_telefono || '',
        airbnb_correo: pPrincipal.airbnb_correo || ''
      });
    }

    this.imagenPreview.set((pPrincipal as any).imagen_url || null);
    const lat = Number(pPrincipal.latitud) || 6.3373;
    const lng = Number(pPrincipal.longitud) || -75.5579;

    this.modalAbierto.set(true);
    setTimeout(() => this.initMiniMap(lat, lng), 150);
  }

  toggleEstadoMaestro(estado: boolean) {
    if (!this.esEdificio()) {
       const p = this.nuevaPropiedad();
       const faltaInfo = !p.airbnb_nombre?.trim() || !p.airbnb_correo?.trim() || !p.airbnb_telefono?.trim();
       if (estado && faltaInfo) {
          this.toastMessage.set('⚠️ Bloqueado: Completa los datos de contacto del anfitrión antes de activar la propiedad.');
          setTimeout(() => this.toastMessage.set(null), 4500);
          this.nuevaPropiedad.update(prop => ({ ...prop, activo: false }));
          return;
       }
    }
    
    this.nuevaPropiedad.update(p => ({ ...p, activo: estado }));
    if (this.esEdificio()) {
      this.listaAptos.update(list => list.map(a => ({ 
        ...a, 
        activo: estado ? !!(a.airbnb_nombre && a.airbnb_correo && a.airbnb_telefono) : false 
      })));
    }
  }

  toggleAptoEstado(aptoNom: string, event: Event) {
    event.stopPropagation();
    const apto = this.listaAptos().find(a => a.nomenclatura === aptoNom);
    if (!apto) return;

    if (!apto.airbnb_nombre || !apto.airbnb_correo || !apto.airbnb_telefono) {
      this.toastMessage.set('⚠️ Bloqueado: Completa los datos de contacto del anfitrión (Doble clic) antes de activar.');
      setTimeout(() => this.toastMessage.set(null), 4500);
      return;
    }

    this.listaAptos.update(list => list.map(a => a.nomenclatura === aptoNom ? { ...a, activo: !a.activo } : a));
    const algunActivo = this.listaAptos().some(a => a.activo);
    this.nuevaPropiedad.update(p => ({ ...p, activo: algunActivo }));
  }

  agregarApto(event?: Event) {
    if (event) event.preventDefault(); 
    const rawVal = this.aptoInput().trim();
    if (!rawVal) return;

    const nuevosAptosStr = rawVal.split(',').map(v => v.replace(/(apartamento|apto\.?|apt\.?)/gi, '').replace(/\s+/g, ' ').trim()).filter(v => v !== '');
    const actualesStr = this.listaAptos().map(a => a.nomenclatura);
    
    const filtradosObj: AptoUI[] = nuevosAptosStr.filter(n => !actualesStr.includes(n)).map(n => ({ 
      nomenclatura: n, activo: false, airbnb_nombre: '', airbnb_telefono: '', airbnb_correo: ''
    }));

    if (filtradosObj.length > 0) {
      const nuevaLista = [...this.listaAptos(), ...filtradosObj].sort((a, b) => 
        b.nomenclatura.localeCompare(a.nomenclatura, undefined, { numeric: true, sensitivity: 'base' })
      );
      this.listaAptos.set(nuevaLista);
      
      const nombreEdificio = this.nuevaPropiedad().nombre || 'el edificio';
      const ultimoAgregado = filtradosObj[filtradosObj.length - 1].nomenclatura;
      
      this.toastMessage.set(`✅ Apto ${ultimoAgregado} añadido. Haz doble clic para agregar el contacto.`);
      this.ultimoAptoAgregado.set(ultimoAgregado); 
      
      setTimeout(() => {
        const elemento = document.getElementById(`apto-row-${ultimoAgregado}`);
        if (elemento) elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      
      setTimeout(() => {
        this.toastMessage.set(null);
        if (this.ultimoAptoAgregado() === ultimoAgregado) this.ultimoAptoAgregado.set(null);
      }, 4000);
    }
    this.aptoInput.set('');
  }

  removerApto(aptoNom: string) {
    const nombreEdificio = this.nuevaPropiedad().nombre || 'el edificio';
    if (confirm(`⚠️ ¿Deseas eliminar permanentemente el Apto ${aptoNom} de ${nombreEdificio}?`)) {
      const elemento = document.getElementById(`apto-row-${aptoNom}`);
      if (elemento) elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });

      this.aptosEliminando.update(list => [...list, aptoNom]);
      setTimeout(() => {
        this.listaAptos.update(list => list.filter(a => a.nomenclatura !== aptoNom));
        this.aptosEliminando.update(list => list.filter(a => a !== aptoNom));
        const algunActivo = this.listaAptos().some(a => a.activo);
        if(!algunActivo && this.listaAptos().length > 0) this.nuevaPropiedad.update(p => ({ ...p, activo: false }));
        this.toastMessage.set(`🗑️ El Apto ${aptoNom} fue eliminado.`);
        setTimeout(() => this.toastMessage.set(null), 3000);
      }, 350); 
    }
  }

  // --- LÓGICA DEL MODAL DE CONTACTO (APARTAMENTOS) ---

  abrirModalContacto(aptoNom: string, event: Event) {
    event.stopPropagation();
    const apto = this.listaAptos().find(a => a.nomenclatura === aptoNom);
    if (apto) {
      this.aptoEnContacto.set({ ...apto });
      this.modalContactoAbierto.set(true);
    }
  }

  cerrarModalContacto() {
    this.modalContactoAbierto.set(false);
    this.aptoEnContacto.set(null);
  }

  guardarContacto() {
    const modificado = this.aptoEnContacto();
    if (!modificado) return;

    modificado.airbnb_nombre = modificado.airbnb_nombre?.trim() || '';
    modificado.airbnb_correo = modificado.airbnb_correo?.trim() || '';
    modificado.airbnb_telefono = modificado.airbnb_telefono?.trim() || '';

    const faltaInfo = !modificado.airbnb_nombre || !modificado.airbnb_correo || !modificado.airbnb_telefono;
    
    if (faltaInfo) {
       modificado.activo = false;
       this.toastMessage.set(`⚠️ Faltan datos. El apartamento no se puede activar sin la info completa.`);
       setTimeout(() => this.toastMessage.set(null), 5000);
    } else {
       modificado.activo = true;
    }

    this.listaAptos.update(list => list.map(a => a.nomenclatura === modificado.nomenclatura ? modificado : a));

    if (modificado.id) {
       const original = this.propiedadesEdificioOriginal().find(p => p.id === modificado.id) || this.propiedades().find(p => p.id === modificado.id);
       const teniaCorreoAntes = original ? !!original.airbnb_correo : false;
       const tieneCorreoAhora = !!modificado.airbnb_correo;
       const esPrimeraVez = !teniaCorreoAntes && tieneCorreoAhora;

       if (original) {
          this.adminService.updatePropiedad(modificado.id, {
             ...original,
             activo: modificado.activo,
             airbnb_nombre: modificado.airbnb_nombre,
             airbnb_telefono: modificado.airbnb_telefono,
             airbnb_correo: modificado.airbnb_correo
          }).subscribe({
             next: () => {
                if (!faltaInfo) {
                  if (esPrimeraVez) {
                      this.adminService.notificarAirbnb(modificado.id!).subscribe();
                      this.toastMessage.set(`🎉 Apto activado. Notificación automática enviada a ${modificado.airbnb_nombre}.`);
                  } else {
                      this.toastMessage.set(`🎉 ¡Felicitaciones! Apto actualizado y activado correctamente.`);
                  }
                  setTimeout(() => this.toastMessage.set(null), 5000);
                }
                this.cargarDatos(); 
             },
             error: () => alert('Error guardando en la base de datos.')
          });
       }
    } else {
       this.toastMessage.set(`⚠️ Datos en memoria. Recuerda hacer clic en "Guardar Edificio" para confirmar.`);
       setTimeout(() => this.toastMessage.set(null), 5000);
    }

    this.cerrarModalContacto();
  }

  notificarContacto(aptoNom: string, event: Event) {
    event.stopPropagation();
    const apto = this.aptoEnContacto();
    if (!apto || !apto.airbnb_correo) return;

    if (!apto.id) {
       this.toastMessage.set(`⚠️ Debes guardar el apartamento primero antes de enviar correos.`);
       setTimeout(() => this.toastMessage.set(null), 4000);
       return;
    }

    this.toastMessage.set(`📧 Conectando con el servidor para notificar a ${apto.airbnb_correo}...`);
    this.adminService.notificarAirbnb(apto.id).subscribe({
       next: () => {
          this.toastMessage.set(`✅ Notificación oficial enviada con éxito a ${apto.airbnb_nombre}.`);
          setTimeout(() => this.toastMessage.set(null), 5000);
       },
       error: () => {
          this.toastMessage.set(`❌ Error de servidor al enviar el correo.`);
          setTimeout(() => this.toastMessage.set(null), 4000);
       }
    });
  }

  // --- BOTÓN MANUAL PARA NOTIFICAR PROPIEDADES INDIVIDUALES ---
  notificarContactoIndividual() {
    const p = this.nuevaPropiedad();
    if (!this.editandoId() || !p.airbnb_correo) return;
    
    this.toastMessage.set(`📧 Conectando con el servidor para notificar a ${p.airbnb_correo}...`);
    this.adminService.notificarAirbnb(this.editandoId()!).subscribe({
       next: () => {
          this.toastMessage.set(`✅ Notificación oficial enviada con éxito a ${p.airbnb_nombre}.`);
          setTimeout(() => this.toastMessage.set(null), 5000);
       },
       error: () => {
          this.toastMessage.set(`❌ Error de servidor al enviar el correo.`);
          setTimeout(() => this.toastMessage.set(null), 4000);
       }
    });
  }

  // --- LÓGICA BASE RESTANTE ---

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

    setTimeout(() => this.miniMap?.invalidateSize(), 250);
  }

  calcularCobertura(lat: number, lng: number) {
    if (!this.miniMap) return;
    this.zonasLayersLayer.clearLayers();
    const pinLatLng = L.latLng(lat, lng);
    const zonasIntersectadas: Zona[] = [];

    this.zonasActivas().forEach(zona => {
      if (zona.latitud && zona.longitud && zona.radio) {
        const zonaLatLng = L.latLng(Number(zona.latitud), Number(zona.longitud));
        const estaAdentro = pinLatLng.distanceTo(zonaLatLng) <= Number(zona.radio);
        
        if (estaAdentro) {
          zonasIntersectadas.push(zona);
          L.circle(zonaLatLng, { color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.25, radius: Number(zona.radio), interactive: false }).addTo(this.zonasLayersLayer);
        } else {
          L.circle(zonaLatLng, { color: '#475569', weight: 1, fillColor: '#334155', fillOpacity: 0.15, radius: Number(zona.radio), interactive: false }).addTo(this.zonasLayersLayer);
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

  abrirModalCrear(lat: number = 6.3373, lng: number = -75.5579) {
    this.editandoId.set(null);
    this.esEdificio.set(false);
    this.listaAptos.set([]);
    this.propiedadesEdificioOriginal.set([]);
    this.aptoInput.set('');
    this.imagenPreview.set(null);
    this.nuevaPropiedad.set({ nombre: '', direccion_apto: 'Buscando...', activo: true, latitud: lat, longitud: lng, zonas_ids: [], airbnb_nombre: '', airbnb_telefono: '', airbnb_correo: '' });
    this.modalAbierto.set(true);
    
    this.obtenerDireccionAutomatica(lat, lng);
    setTimeout(() => this.initMiniMap(lat, lng), 150);
  }

  eliminarGrupo(grupo: GrupoPropiedad, event: Event) {
    event.stopPropagation();
    const mensaje = grupo.esEdificio 
      ? `¿Seguro que deseas eliminar el edificio "${grupo.nombrePrincipal}" y sus ${grupo.propiedades.length} apartamentos?` 
      : `¿Seguro que deseas eliminar la propiedad "${grupo.nombrePrincipal}"?`;
      
    if (confirm(mensaje)) {
      const requests = grupo.propiedades.map(p => this.adminService.deletePropiedad(p.id!));
      forkJoin(requests).subscribe({
        next: () => this.cargarDatos(),
        error: () => alert('Error al eliminar.')
      });
    }
  }

  descargarQR(grupo: GrupoPropiedad, event: Event) {
    event.stopPropagation();
    grupo.propiedades.forEach((prop, index) => {
      if (!prop.qr_access_token) return;
      setTimeout(() => {
        const urlDestino = `https://airbnb-delivery-frontend.vercel.app/${prop.qr_access_token}`;
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(urlDestino)}&color=0f172a&bgcolor=ffffff`;
        fetch(url).then(res => res.blob()).then(blob => {
          const a = document.createElement('a');
          a.href = window.URL.createObjectURL(blob);
          a.download = `QR_${prop.nombre.replace(/\s+/g, '_')}.png`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }).catch(() => console.error('Error QR'));
      }, index * 400); 
    });
  }

  descargarQRUnico(prop: Propiedad, event: Event) {
    event.stopPropagation();
    if (!prop.qr_access_token) return;
    const urlDestino = `https://airbnb-delivery-frontend.vercel.app/${prop.qr_access_token}`;
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(urlDestino)}&color=0f172a&bgcolor=ffffff`;
    fetch(url).then(res => res.blob()).then(blob => {
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `QR_${prop.nombre.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }).catch(() => alert('Error QR'));
  }

  cerrarModal() {
    this.modalAbierto.set(false);
    this.editandoId.set(null);
    if (this.miniMap) { this.miniMap.remove(); this.miniMap = null; }
  }

  guardarDatos() {
    if (!this.formularioValido()) return;
    const propData = this.nuevaPropiedad();

    const latFix = Number(propData.latitud).toFixed(5);
    const lngFix = Number(propData.longitud).toFixed(5);
    const dirText = (propData.direccion_apto || '').toLowerCase().trim();

    const idsOriginales = this.esEdificio() ? this.propiedadesEdificioOriginal().map(p => p.id) : (this.editandoId() ? [this.editandoId()] : []);

    const existeConflicto = this.propiedades().some(p => {
      if (p.id && idsOriginales.includes(p.id)) return false; 
      const pLatFix = Number(p.latitud).toFixed(5);
      const pLngFix = Number(p.longitud).toFixed(5);
      const pDirText = (p.direccion_apto || '').toLowerCase().trim();
      return (pLatFix === latFix && pLngFix === lngFix) || (pDirText === dirText);
    });

    if (existeConflicto) {
      alert('🚫 ACCIÓN BLOQUEADA: Ya existe una propiedad o edificio registrado en esta dirección o coordenadas. Edita el edificio existente en su lugar.');
      return;
    }

    // LÓGICA DE PROPIEDADES INDIVIDUALES (Limpieza y Validación de Contacto)
    if (!this.esEdificio()) {
       propData.airbnb_nombre = propData.airbnb_nombre?.trim() || '';
       propData.airbnb_correo = propData.airbnb_correo?.trim() || '';
       propData.airbnb_telefono = propData.airbnb_telefono?.trim() || '';
       
       const faltaInfo = !propData.airbnb_nombre || !propData.airbnb_correo || !propData.airbnb_telefono;
       
       if (faltaInfo) {
          propData.activo = false;
       } else if (!this.editandoId()) {
          propData.activo = true; 
       }
    }

    if (!this.editandoId()) {
      if (!this.esEdificio()) {
        this.adminService.createPropiedad(propData).subscribe({ 
          next: (res) => { 
            if (propData.airbnb_correo && propData.activo) {
               this.adminService.notificarAirbnb(res.id!).subscribe();
               this.toastMessage.set(`🎉 Propiedad creada. Notificación automática enviada a ${propData.airbnb_nombre}.`);
               setTimeout(() => this.toastMessage.set(null), 5000);
            }
            this.cargarDatos(); this.cerrarModal(); 
          } 
        });
      } else {
        const requests = this.listaAptos().map(aptoObj => {
          return this.adminService.createPropiedad({
            ...propData,
            nombre: `${propData.nombre} - Apto ${aptoObj.nomenclatura}`,
            direccion_apto: propData.direccion_apto,
            activo: aptoObj.activo,
            airbnb_nombre: aptoObj.airbnb_nombre,
            airbnb_telefono: aptoObj.airbnb_telefono,
            airbnb_correo: aptoObj.airbnb_correo
          });
        });
        forkJoin(requests).subscribe({ next: () => { this.cargarDatos(); this.cerrarModal(); }, error: () => alert('Error creando edificio.') });
      }
      return;
    }

    if (!this.esEdificio()) {
      const propOriginal = this.propiedades().find(p => p.id === this.editandoId());
      const teniaCorreoAntes = propOriginal ? !!propOriginal.airbnb_correo : false;
      const tieneCorreoAhora = !!propData.airbnb_correo;
      const esPrimeraVez = !teniaCorreoAntes && tieneCorreoAhora;

      if (!propOriginal?.airbnb_correo && tieneCorreoAhora) propData.activo = true;

      this.adminService.updatePropiedad(this.editandoId()!, propData).subscribe({ 
        next: () => { 
          if (esPrimeraVez && propData.activo) {
             this.adminService.notificarAirbnb(this.editandoId()!).subscribe();
             this.toastMessage.set(`🎉 Propiedad actualizada. Notificación automática enviada a ${propData.airbnb_nombre}.`);
             setTimeout(() => this.toastMessage.set(null), 5000);
          }
          this.cargarDatos(); this.cerrarModal(); 
        } 
      });
      return;
    }

    const aptosActuales = this.listaAptos();
    const originales = this.propiedadesEdificioOriginal();
    const requests: any[] = [];

    originales.forEach(orig => {
      const aptoOrig = orig.nombre.includes(' - Apto ') ? orig.nombre.split(' - Apto ')[1] : orig.nombre;
      const aptoUI = aptosActuales.find(a => a.nomenclatura === aptoOrig);
      
      if (aptoUI) {
        requests.push(this.adminService.updatePropiedad(orig.id!, { 
          ...orig, 
          nombre: `${propData.nombre} - Apto ${aptoOrig}`, 
          direccion_apto: propData.direccion_apto, 
          latitud: propData.latitud, 
          longitud: propData.longitud, 
          zonas_ids: propData.zonas_ids, 
          imagen_url: propData.imagen_url, 
          activo: aptoUI.activo,
          airbnb_nombre: aptoUI.airbnb_nombre,
          airbnb_telefono: aptoUI.airbnb_telefono,
          airbnb_correo: aptoUI.airbnb_correo
        }));
      } else {
        requests.push(this.adminService.deletePropiedad(orig.id!));
      }
    });

    const aptosOriginalesNombres = originales.map(o => o.nombre.includes(' - Apto ') ? o.nombre.split(' - Apto ')[1] : o.nombre);
    const aptosNuevos = aptosActuales.filter(a => !aptosOriginalesNombres.includes(a.nomenclatura));
    
    aptosNuevos.forEach(nuevoObj => {
      requests.push(this.adminService.createPropiedad({ 
        ...propData, 
        nombre: `${propData.nombre} - Apto ${nuevoObj.nomenclatura}`, 
        direccion_apto: propData.direccion_apto, 
        activo: nuevoObj.activo,
        airbnb_nombre: nuevoObj.airbnb_nombre,
        airbnb_telefono: nuevoObj.airbnb_telefono,
        airbnb_correo: nuevoObj.airbnb_correo
      }));
    });

    forkJoin(requests).subscribe({ next: () => { this.cargarDatos(); this.cerrarModal(); }, error: () => alert('Error sincronizando el edificio.') });
  }

  centrarEnPropiedad(grupo: GrupoPropiedad) {
    if (grupo.latitud && grupo.longitud) this.map.flyTo([grupo.latitud, grupo.longitud], 17, { duration: 1.5 });
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
import { Routes } from '@angular/router';
import { ClientHome } from './client/client-home/client-home';
import { AdminLayoutComponent } from './admin/layout/layout.component';
import { Dashboard } from './admin/dashboard/dashboard';
import { ZonasList } from './admin/features/zonas/zonas-list/zonas-list';
import { CategoriasList } from './admin/features/categorias/categorias-list/categorias-list';
import { PropiedadesList } from './admin/features/propiedades/propiedades-list/propiedades-list';
import { AliadosList } from './admin/features/aliados/aliados-list/aliados-list';
import { AliadoForm } from './admin/features/aliados/aliado-form/aliado-form';

export const routes: Routes = [
  // Si alguien entra sin token (Ej: a la raíz pura)
  { path: '', component: ClientHome },

  // El Módulo Super Admin estructurado bajo /admin
  {
    path: 'admin',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: Dashboard },
      { path: 'zonas', component: ZonasList },
      { path: 'categorias', component: CategoriasList },
      { path: 'propiedades', component: PropiedadesList },
      { path: 'aliados', component: AliadosList }
    ]
  },

  // Portal de Gestión para los Aliados Comerciales
  { 
    path: 'partner/:token', 
    component: AliadoForm 
  },

  // LA RUTA DEL HUÉSPED (Be-Nest IQ)
  // Captura cualquier enlace tipo misitio.com/qr-prop-101
  { 
    path: ':token', 
    component: ClientHome 
  },

  // Redirección por defecto para URLs inválidas
  { path: '**', redirectTo: '' }
];
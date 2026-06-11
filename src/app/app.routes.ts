import { Routes } from '@angular/router';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
    {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent)
  },
  // CAPA 1: PANEL DE CONTROL SUPER_ADMIN (SaaS Maestro)
  {
    path: 'superadmin',
    canActivate: [roleGuard(['ROLE_SUPER_ADMIN'])],
    loadComponent: () => import('./core/layouts/superadmin-layout').then(m => m.SuperAdminLayoutComponent),
    children: [
      {
        path: 'empresas',
        loadComponent: () => import('./features/superadmin/gestion-empresas').then(m => m.GestionEmpresasComponent)
      },
      {
        path: 'metricas',
        loadComponent: () => import('./features/superadmin/gestion-empresas').then(m => m.GestionEmpresasComponent) // Temporal
      },
      {
        path: 'config',
        loadComponent: () => import('./features/superadmin/gestion-empresas').then(m => m.GestionEmpresasComponent) // Temporal
      },
      {
        path: '',
        redirectTo: 'empresas',
        pathMatch: 'full'
      }
    ]
  },
  // CAPA 2: PANEL DE ERP/TPV
  {
    path: '', 
    redirectTo: 'login', 
    pathMatch: 'full' 
  },
  // CAPA 2: PANEL DE ERP/TPV (Ecosistema Multi-tenant para Tiendas)
  // Metemos el Guard aquí arriba para blindar todos los hijos de golpe
  {
    path: '',
    canActivate: [roleGuard(['ROLE_ADMIN', 'ROLE_EMPLEADO'])], // Solo entran los jefes o empleados
    loadComponent: () => import('./core/layouts/layout').then(m => m.LayoutComponent),
    children: [
     { 
      path: 'ventas', // Todas las rutas de ventas abrirán el TPV, pero con diferentes estados (nuevo ticket, ticket abierto, etc)
      children: [
        {
          path: '', // Si entra a /ventas, se le abre el TPV para facturar directo
          loadComponent: () => import('./features/ventas/tpv/tpv').then(m => m.TpvComponent) 
      },
      {
        path: 'tickets', // Si entra a /ventas/tickets, se le abre el historial de tickets
        loadComponent: () => import('./features/ventas/orden-list/orden-list').then(m => m.OrdenListComponent) 
      }
    ]
  },   
  {
    path: 'inventario', 
    children: [
    { 
      path: '', // Si entra a /inventario, se le abre el listado de artículos
      loadComponent: () => import('./features/inventario/inventario-list/inventario-list').then(m => m.InventarioListComponent) 
    },
    { 
      path: 'nuevo', // Si entra a /inventario/nuevo, se le abre el formulario para crear un nuevo artículo
      loadComponent: () => import('./features/inventario/articulo-form/articulo-form').then(m => m.ArticuloFormComponent) 
    },
    { 
      path: 'editar/:id', // Si entra a /inventario/editar/1, se le abre el formulario para editar el artículo con id 1
      loadComponent: () => import('./features/inventario/articulo-form/articulo-form').then(m => m.ArticuloFormComponent) 
    }]
   },
   { 
      path: 'caja', 
      loadComponent: () => import('./features/caja/caja-resumen/caja-resumen').then(m => m.CajaResumenComponent) 
   },
   {
    path: 'contabilidad',
    loadComponent: () => import('./features/contabilidad/contabilidad').then(m => m.ContabilidadComponent)
  },
  {
    path: 'proveedores',
    loadComponent: () => import('./features/proveedores/proveedores').then(m => m.ProveedoresComponent)
  },
  {
    path: 'clientes',
    loadComponent: () => import('./features/clientes/clientes').then(m => m.ClientesComponent)
  },
  {
    path: 'configuracion',
    loadComponent: () => import('./features/configuracion/configuracion').then(m => m.ConfiguracionComponent)
  },
   // Ruta comodín (por si escriben algo que no existe)
  { path: '**', redirectTo: 'ventas' }
  ]
 }
]

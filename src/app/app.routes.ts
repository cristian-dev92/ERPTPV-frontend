import { Routes } from '@angular/router';

export const routes: Routes = [
    {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: '', 
    redirectTo: 'login', 
    pathMatch: 'full' 
  },
  // Añadimos Inventario y la Caja
  // Todas las rutas de aquí abajo usarán el Layout (Menú + Cabecera)
  {
    path: '',
    loadComponent: () => import('./shared/components/layout/layout').then(m => m.LayoutComponent),
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
   // Ruta comodín (por si escriben algo que no existe)
  { path: '**', redirectTo: 'tpv' }
  ]
 }
]

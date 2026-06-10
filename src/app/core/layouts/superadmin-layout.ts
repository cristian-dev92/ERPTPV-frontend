import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './superadmin-layout.html',
  styleUrls: ['./superadmin-layout.scss']
})
export class SuperAdminLayoutComponent {
  // Signal para controlar si el menú lateral está compacto o expandido
  sidebarColapsado = signal<boolean>(false);

  // Podríamos tipar esto según el rol, ahora mismo enfocado a SuperAdmin
  menuItems = [
    { ruta: '/superadmin/empresas', etiqueta: 'Gestión Empresas', icono: '🏢' },
    { ruta: '/superadmin/metricas', etiqueta: 'Métricas SaaS', icono: '📊' },
    { ruta: '/superadmin/config', etiqueta: 'Configuración Global', icono: '⚙️' }
  ];

  alternarSidebar() {
    this.sidebarColapsado.update(estado => !estado);
  }
}
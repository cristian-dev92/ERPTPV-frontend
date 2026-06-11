import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UiService } from '../services/ui.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './superadmin-layout.html',
  styleUrls: ['./superadmin-layout.scss']
})
export class SuperAdminLayoutComponent {
  private authService = inject(AuthService);
  private uiService = inject(UiService)
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

  ejecutarLogout() {
    // Lanzamos el toast de aviso justo antes de limpiar el estado
    this.uiService.mostrarToast('Sesión de SuperAdmin cerrada correctamente', 'success');
    
    // Ejecutamos la limpieza y la redirección al login
    this.authService.logout();
  }
  
}
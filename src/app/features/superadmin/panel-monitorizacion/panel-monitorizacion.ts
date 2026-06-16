import { Component, OnInit, inject, signal } from '@angular/core';
import { UiService } from '../../../core/services/ui.service';
import { EmpresaEstadoDTO, SuperAdminService } from '../../../core/services/superdamin.service';

@Component({
  selector: 'app-panel-monitorizacion',
  standalone: true,
  imports: [], // 🚀 100% libre de directivas heredadas viejas
  templateUrl: './panel-monitorizacion.html',
  styleUrls: ['./panel-monitorizacion.scss']
})
export class PanelMonitorizacionComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private uiService = inject(UiService);

  // Estados reactivos
  empresasSistemas = signal<EmpresaEstadoDTO[]>([]);
  loading = signal<boolean>(false);

  // Métricas rápidas de infraestructura
  entornosTotales = signal<number>(0);
  entornosCaidos = signal<number>(0);

  ngOnInit(): void {
    this.comprobarConectividadSaaS();
  }

  comprobarConectividadSaaS(): void {
    this.loading.set(true);
    this.superAdminService.obtenerEstadoEmpresas().subscribe({
      next: (data) => {
        this.empresasSistemas.set(data);
        
        // Calculamos contadores globales para el cuadro de mandos rápido
        this.entornosTotales.set(data.length);
        this.entornosCaidos.set(data.filter(e => !e.verifactuOk).length);
        
        this.loading.set(false);
        this.uiService.mostrarToast('Sistemas fiscales sincronizados', 'success');
      },
      error: () => {
        this.uiService.mostrarToast('Fallo crítico en la traza de red del ERP', 'error');
        this.loading.set(false);
      }
    });
  }
}
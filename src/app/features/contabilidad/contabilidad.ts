import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContabilidadService, ResumenContableDTO } from '../../core/services/contabilidad.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-contabilidad',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contabilidad.html',
  styleUrl: './contabilidad.scss'
})
export class ContabilidadComponent {
  private contabilidadService = inject(ContabilidadService);

  // Signals de Estado de Filtros
  anioActual = new Date().getFullYear();
  trimestreSeleccionado = signal<string>('T1'); 
  tipoFiltroSeleccionado = signal<string>('TODOS'); // "TODOS" | "VENTAS" | "GASTOS" | "DEVOLUCIONES"
  
  // Lista de movimientos en pantalla y estado de carga
  resumenKpis = signal<ResumenContableDTO | null>(null);
  listaMovimientosTabla = signal<any[]>([]);
  cargando = signal<boolean>(false);

  // Mapeo reactivo de fechas basado en el trimestre seleccionado (Formato ISO para Spring Boot)
  rangoFechas = computed(() => {
    const anio = this.anioActual;
    switch (this.trimestreSeleccionado()) {
      case 'T1': return { inicio: `${anio}-01-01`, fin: `${anio}-03-31` };
      case 'T2': return { inicio: `${anio}-04-01`, fin: `${anio}-06-30` };
      case 'T3': return { inicio: `${anio}-07-01`, fin: `${anio}-09-30` };
      case 'T4': return { inicio: `${anio}-10-01`, fin: `${anio}-12-31` };
      default: return { inicio: `${anio}-01-01`, fin: `${anio}-12-31` };
    }
  });

  // Signals Computados para las Tarjetas de KPI resumidas en la parte superior
  totalIngresos = computed(() => this.resumenKpis()?.totalFacturado ?? 0);
  totalGastos = computed(() => this.resumenKpis()?.totalGastos ?? 0);
  balanceTotal = computed(() => this.totalIngresos() - this.totalGastos());
  movimientos = computed(() => this.listaMovimientosTabla());

  constructor() {
    // Carga inicial automática al construir el componente
    this.cargarDatosContables();
  }

  cargarDatosContables() {
    this.cargando.set(true);
    const { inicio, fin } = this.rangoFechas();
    const filtro = this.tipoFiltroSeleccionado();
    
    // Lanzamos las dos peticiones en paralelo. Cuando terminen las dos, actualizamos la UI
    forkJoin({
      kpis: this.contabilidadService.obtenerResumenKpis(inicio, fin),
      tickets: this.contabilidadService.obtenerTicketsContables(inicio, fin, filtro)
    }).subscribe({
      next: ({ kpis, tickets }) => {
        this.resumenKpis.set(kpis);
        this.listaMovimientosTabla.set(tickets);
        this.cargando.set(false);
      },
      error: (err: any) => {
        console.error('Error en la manguera contable:', err);
        this.cargando.set(false);
      }
    });
  }

  // Manejador del desplegable de formatos de exportación
  procesarExportacion(formato: string) {
  const { inicio, fin } = this.rangoFechas();
    const filtro = this.tipoFiltroSeleccionado();
    
    const observableDownload = formato === 'PDF' 
      ? this.contabilidadService.exportarPdf(inicio, fin, filtro)
      : this.contabilidadService.exportarCsv(inicio, fin);

    observableDownload.subscribe({
      next: (blob: Blob) => {
        const extension = formato === 'PDF' ? 'pdf' : 'csv';
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = `Informe_${inicio}_al_${fin}.${extension}`;
        link.click();
        window.URL.revokeObjectURL(link.href);
      },
      error: (err) => console.error(`Error al descargar el archivo ${formato}:`, err)
    });
  }
 
}
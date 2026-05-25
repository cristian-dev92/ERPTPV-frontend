import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContabilidadService, ResumenContableDTO } from '../../core/services/contabilidad.service';
import { UiService } from '../../core/services/ui.service';

@Component({
  selector: 'app-contabilidad',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './contabilidad.html',
  styleUrl: './contabilidad.scss'
})
export class ContabilidadComponent implements OnInit {
  private contabilidadService = inject(ContabilidadService);
  private uiService = inject(UiService);

  // Signals para las fechas de los filtros
  fechaInicio = signal<string>('');
  fechaFin = signal<string>('');

  // Signal para los datos que vienen del Bakend
  datosContables = signal<ResumenContableDTO | null>(null);

  ngOnInit() {
    this.establecerMesActual();
    this.cargarInforme();
  }

  cargarInforme() {
    if (!this.fechaInicio() || !this.fechaFin()) {
      this.uiService.mostrarToast('Por favor, selecciona un rango de fechas válido', 'warning');
      return;
    }

    this.contabilidadService.obtenerResumen(this.fechaInicio(), this.fechaFin()).subscribe({
      next: (res) => this.datosContables.set(res),
      error: (err) => this.uiService.mostrarToast('Error al cargar la contabilidad: ' + (err.error || err.message), 'error')
    });
  }

  // --- ATAJOS RÁPIDOS DE FILTROS ---
  establecerMesActual() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    
    const inicio = new Date(y, m, 1).toISOString().split('T')[0];
    const fin = new Date(y, m + 1, 0).toISOString().split('T')[0];
    
    this.fechaInicio.set(inicio);
    this.fechaFin.set(fin);
  }

  establecerTrimestreActual() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const trimestreActual = Math.floor(hoy.getMonth() / 3); // 0 al 3
    
    const inicioMes = trimestreActual * 3;
    const inicio = new Date(y, inicioMes, 1).toISOString().split('T')[0];
    const fin = new Date(y, inicioMes + 3, 0).toISOString().split('T')[0];
    
    this.fechaInicio.set(inicio);
    this.fechaFin.set(fin);
  }

  imprimirInforme() {
    window.print();
  }
}
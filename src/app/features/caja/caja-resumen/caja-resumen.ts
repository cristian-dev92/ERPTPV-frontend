import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { OrdenService } from '../../../core/services/orden.service';
import { Orden } from '../../../core/models/orden.model';
import { CurrencyPipe, DatePipe } from '@angular/common';

@Component({
  selector: 'app-caja-resumen',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './caja-resumen.html',
  styleUrl: './caja-resumen.scss'
})
export class CajaResumenComponent implements OnInit {
  private ordenService = inject(OrdenService);

  ordenes = signal<Orden[]>([]);
  fechaHoy = new Date();

  // --- CÁLCULOS REACTIVOS ---
  
  // Dinero real que ha entrado hoy (lo que el cliente pagó en el momento)
  totalEfectivo = computed(() => 
    this.ordenes().reduce((acc, o) => acc + o.importePagado, 0)
  );

  // Número de reparaciones vs Ventas directas
  numVentas = computed(() => this.ordenes().filter(o => o.tipo === 'VENTA').length);
  numReparaciones = computed(() => this.ordenes().filter(o => o.tipo === 'REPARACION').length);

  ngOnInit() {
    this.cargarMovimientos();
  }

  cargarMovimientos() {
    this.ordenService.getOrdenesHoy().subscribe(data => {
      this.ordenes.set(data);
    });
  }
}
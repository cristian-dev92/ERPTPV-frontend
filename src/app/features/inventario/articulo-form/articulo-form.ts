import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Router } from '@angular/router';
import { UiService } from '../../../core/services/ui.service';

@Component({
  selector: 'app-articulo-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './articulo-form.html',
  styleUrl: './articulo-form.scss'
})
export class ArticuloFormComponent {
  // 1. Definición de señales para el formulario
  nombre = signal<string>('');
  tipo = signal<'PRODUCTO' | 'SERVICIO'>('PRODUCTO');
  stockInicial = signal<number | null>(null);
  stockMinimo = signal<number | null>(null);
  idProveedor = signal<number | null>(null);
  
  precioFinal = signal<number | null>(null); // El PVP con IVA que teclea el usuario
  porcentajeIva = signal<number>(21);       // 21% seleccionado por defecto

  // Lista de proveedores de prueba (adapta a tu modelo)
  proveedores = [
    { id: 1, nombre: 'Distribuidor Oficial S.L.' },
    { id: 2, nombre: 'Componentes Calzado Norte' }
  ];

  // 2. Cálculo de la Base Imponible en tiempo real (Solo Visual)
  precioBaseVisual = computed(() => {
    const pvp = this.precioFinal();
    const iva = this.porcentajeIva();

    if (!pvp || pvp <= 0) return '0.00';

    // Fórmula B2C: PVP / (1 + (IVA / 100))
    const baseImponible = pvp / (1 + (iva / 100));
    
    // Lo devolvemos formateado a 2 decimales para la vista
    return baseImponible.toFixed(2);
  });

  // 3. Envío del formulario al Backend
  guardarArticulo(): void {
    if (!this.nombre() || !this.precioFinal()) {
      alert('Por favor, rellena los campos obligatorios.');
      return;
    }

    // Construimos el JSON exactamente como lo espera el refactor del núcleo financiero
    const articuloPayload = {
      nombre: this.nombre(),
      tipo: this.tipo(),
      stock: this.tipo() === 'PRODUCTO' ? this.stockInicial() : null,
      stockMinimo: this.tipo() === 'PRODUCTO' ? this.stockMinimo() : null,
      idProveedor: this.idProveedor(),
      precioFinal: this.precioFinal() ?? 0, // Aseguramos que no sea null
      porcentajeIva: this.porcentajeIva(),  // Envía el número limpio (21, 10, etc.)
      activo: true // Puedes ajustar esto según tu lógica de negocio
    };

    console.log('Enviando DTO al Backend:', articuloPayload);

    // Aquí llamarías a tu servicio para enviar el artículo al backend
    this.articuloService.crearArticulo(articuloPayload).subscribe({
      next: () => {
      this.uiService.mostrarToast('Artículo creado con éxito', 'success');
      this.router.navigate(['/inventario']);
       },
       error: (err) => {
         console.error('Error al crear artículo:', err);
         this.uiService.mostrarToast('Error al crear el artículo', 'error');
       }
     });
  }

  // Inyección de dependencias
  private articuloService = inject(ArticuloService);
  private uiService = inject(UiService);
  private router = inject(Router);

}
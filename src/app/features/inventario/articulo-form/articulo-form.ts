import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Router } from '@angular/router';
import { UiService } from '../../../core/services/ui.service';
import { CommonModule } from "@angular/common";
import { ProveedorDTO, ProveedorService } from '../../../core/services/proveedor.service';

@Component({
  selector: 'app-articulo-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './articulo-form.html',
  styleUrl: './articulo-form.scss'
})
export class ArticuloFormComponent implements OnInit {
  // 1. Definición de señales para el formulario
  nombre = signal<string>('');
  tipo = signal<'PRODUCTO' | 'SERVICIO'>('PRODUCTO');
  stockInicial = signal<number | null>(null);
  stockMinimo = signal<number | null>(null);
  idProveedor = signal<number | null>(null);
  
  precioFinal = signal<number | null>(null); // El PVP con IVA que teclea el usuario
  porcentajeIva = signal<number>(21);       // 21% seleccionado por defecto

  // === Señal para las notas internas del artículo ===
  notasReparacion = signal<string>('');

  // === ESTADOS PARA EL TECLADO TÁCTIL EN FORMULARIO ===
  mostrarTeclado = signal<boolean>(false);
  campoObjetivo = signal<'PRECIO' | 'IVA' | null>(null);
  valorTeclado = signal<string>('');

   // Inyección de dependencias
  private articuloService = inject(ArticuloService);
  private uiService = inject(UiService);
  private router = inject(Router);
  private proveedorservice = inject(ProveedorService);
  
  // Señal limpia para almacenar los proveedores reales del Backend
  proveedores = signal<ProveedorDTO[]>([]);

  ngOnInit(): void {
    this.cargarProveedores();
  }

  // Carga real de tus proveedores desde el backend
  cargarProveedores(): void {
    this.proveedorservice.obtenerMisProveedores().subscribe({
      next: (data: ProveedorDTO[]) => {
        this.proveedores.set(data);
        console.log('Proveedores cargados del backend:', data);
      },
      error: (err: any) => {
        console.error('Error al cargar proveedores:', err);
        this.uiService.mostrarToast('No se pudieron cargar los proveedores', 'error');
      }
    });
  }


  // Cálculo de la Base Imponible en tiempo real (Solo Visual)
  precioBaseVisual = computed(() => {
    const pvp = this.precioFinal();
    const iva = this.porcentajeIva();

    if (!pvp || pvp <= 0) return '0.00';

    // Fórmula B2C: PVP / (1 + (IVA / 100))
    const baseImponible = pvp / (1 + (iva / 100));
    
    // Lo devolvemos formateado a 2 decimales para la vista
    return baseImponible.toFixed(2);
  });

  // Envío del formulario al Backend
  guardarArticulo(): void {
    if (!this.nombre() || !this.precioFinal()) {
      this.uiService.mostrarToast('Por favor, rellena los campos obligatorios.', 'error');
      return;
    }

    // Comprobación a prueba de nulls
    const valorPrecio = this.precioFinal();
    if (valorPrecio === null || valorPrecio === undefined || valorPrecio <= 0) {
      this.uiService.mostrarToast('El precio final debe ser mayor que 0.', 'error');
      return;
    }

    // Construimos el JSON exactamente como lo espera el refactor del núcleo financiero
    const articuloPayload = {
      nombre: this.nombre(),
      tipo: this.tipo(),
      stock: this.tipo() === 'PRODUCTO' ? this.stockInicial() : null,
      stockMinimo: this.tipo() === 'PRODUCTO' ? this.stockMinimo() : null,
      idProveedor: this.idProveedor() ? Number(this.idProveedor()) : null,
      precioFinal: this.precioFinal() ?? 0, // Aseguramos que no sea null
      porcentajeIva: this.porcentajeIva(),  // Envía el número limpio (21, 10, etc.)
      notas: this.notasReparacion().trim(), // Incluimos las notas de reparación
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


/* Abre el teclado en pantalla para el precio o el IVA */
  abrirTeclado(objetivo: 'PRECIO' | 'IVA') {
    this.campoObjetivo.set(objetivo);
    
    if (objetivo === 'PRECIO') {
      this.valorTeclado.set(this.precioFinal() ? this.precioFinal()!.toString() : '');
    } else {
      this.valorTeclado.set(this.porcentajeIva().toString());
    }
    
    this.mostrarTeclado.set(true);
  }

  /* Procesa las pulsaciones del teclado virtual */
  pulsarTecla(tecla: string) {
    const actual = this.valorTeclado();
    
    // Validar decimales (solo un punto y máximo dos decimales)
    if (tecla === '.' && actual.includes('.')) return;
    // Limitar a dos decimales
    if (actual.includes('.') && actual.split('.')[1].length >= 2) return;

    this.valorTeclado.set(actual + tecla);
    this.actualizarCampoEnTiempoReal();
  }

  borrarCaracter() {
    const actual = this.valorTeclado();
    if (actual.length > 0) {
      this.valorTeclado.set(actual.slice(0, -1));
      this.actualizarCampoEnTiempoReal();
    }
  }

  limpiarTeclado() {
    this.valorTeclado.set('');
    this.actualizarCampoEnTiempoReal();
  }

  private actualizarCampoEnTiempoReal() {
    const cadena = this.valorTeclado();
    // Si termina en punto (ej: "25."), no forzamos el parseo para dejar que el usuario escriba los decimales
    if (cadena.endsWith('.')) return; 

    const valorNum = parseFloat(cadena) || 0;
    if (this.campoObjetivo() === 'PRECIO') {
      this.precioFinal.set(valorNum === 0 ? null : valorNum);
    } else {
      this.porcentajeIva.set(valorNum);
    }
  }

  cerrarTeclado() {
    this.mostrarTeclado.set(false);
    this.campoObjetivo.set(null);
    this.valorTeclado.set('');
  }

  cancelarYVolver() {
    this.cerrarTeclado();
    this.router.navigate(['/inventario']);
  }

}
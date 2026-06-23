import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ArticuloService } from '../../../core/services/articulo.service';
import { ActivatedRoute, Router } from '@angular/router';
import { UiService } from '../../../core/services/ui.service';
import { CommonModule } from "@angular/common";
import { ProveedorDTO, ProveedorService } from '../../../core/services/proveedor.service';
import { isMobileOrTablet } from '../../../core/utils/device-utils';

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

  // Identificador para saber si estamos editando o creando
  idArticuloEdicion = signal<number | null>(null);

  // === ESTADOS PARA EL TECLADO TÁCTIL EN FORMULARIO ===
  mostrarTecladoGeneral = signal<boolean>(false);
  inputObjetivoTeclado = signal<string>('');
  valorTecladoEnConstruccion = signal<string>('');
  mayusculasGeneral = signal<boolean>(true);

   // Inyección de dependencias
  private articuloService = inject(ArticuloService);
  private uiService = inject(UiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private proveedorservice = inject(ProveedorService);
  
  // Señal limpia para almacenar los proveedores reales del Backend
  proveedores = signal<ProveedorDTO[]>([]);
  filtroProveedor = signal<string>('');

  ngOnInit(): void {
    this.cargarProveedores();
    this.comprobarModoEdicion();
  }

  // 🚀 Comprueba si viene un ID en la ruta para cargar los datos del artículo
  comprobarModoEdicion(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.idArticuloEdicion.set(id);
      
      this.articuloService.getArticuloById(id).subscribe({
        next: (articulo: any ) => {
          // Rellenamos las señales con la información recuperada del backend
          this.nombre.set(articulo.nombre);
          this.tipo.set(articulo.tipo);
          this.stockInicial.set(articulo.stock ?? null);
          this.stockMinimo.set(articulo.stockMinimo ?? null);
          this.idProveedor.set(articulo.idProveedor ?? null);
          this.precioFinal.set(articulo.precioFinal);
          this.porcentajeIva.set(articulo.porcentajeIva);
          this.notasReparacion.set(articulo.notas || '');
        },
        error: (err) => {
          console.error('Error al recuperar el artículo:', err);
          this.uiService.mostrarToast('No se pudo cargar la información del artículo.', 'error');
          this.router.navigate(['/inventario']);
        }
      });
    }
  }

  // Carga real de tus proveedores desde el backend
  cargarProveedores(): void {
    this.proveedorservice.obtenerMisProveedores().subscribe({
      next: (data: ProveedorDTO[]) => {
        this.proveedores.set(data);
      },
      error: (err: any) => {
        console.error('Error al cargar proveedores:', err);
        this.uiService.mostrarToast('No se pudieron cargar los proveedores', 'error');
      }
    });
  }

// === MÉTODOS DEL TECLADO GENERAL ===
  abrirTecladoGeneralForm(
    objetivo: 'NOMBRE' | 'PRECIO' | 'IVA' | 'STOCK_INICIAL' | 'STOCK_MINIMO' | 'NOTAS' | 'BUSCAR_PROVEEDOR', 
    valorActual: string = ''
  ) {
    // Si están con la tablet en el taller, frenamos vuestro teclado virtual
    if (isMobileOrTablet()) {
      return;
    }
    this.inputObjetivoTeclado.set(objetivo);
    this.valorTecladoEnConstruccion.set(valorActual);
    this.mostrarTecladoGeneral.set(true);
  }

  pulsarTeclaGeneral(caracter: string) {
    const actual = this.valorTecladoEnConstruccion();
    const objetivo = this.inputObjetivoTeclado();

    // Validaciones de punto decimal para Precio e IVA
    if (caracter === '.' && actual.includes('.')) return;
    if (actual.includes('.') && actual.split('.')[1].length >= 2 && (objetivo === 'PRECIO' || objetivo === 'IVA')) return;

    // Si es una letra alfabética (no números, ni espacios, ni caracteres especiales), respetamos el Shift
    let valorAInsertar = caracter;
    const esLetra = /^[a-zA-ZÑñ]$/.test(caracter);
    
    if (esLetra) {
      valorAInsertar = this.mayusculasGeneral() ? caracter.toUpperCase() : caracter.toLowerCase();
    }

    this.valorTecladoEnConstruccion.update(val => val + valorAInsertar);
  }

  alternarMayusculasGeneral() {
    this.mayusculasGeneral.set(!this.mayusculasGeneral());
  }

  borrarUltimoCaracterGeneral() {
    this.valorTecladoEnConstruccion.update(val => val.slice(0, -1));
  }

  limpiarTecladoGeneral() {
    this.valorTecladoEnConstruccion.set('');
  }

  cerrarTecladoGeneral() {
    this.mostrarTecladoGeneral.set(false);
  }

  aplicarTextoAlFormulario() {
    const objetivo = this.inputObjetivoTeclado();
    const valor = this.valorTecladoEnConstruccion();

    if (objetivo === 'NOMBRE') this.nombre.set(valor);
    if (objetivo === 'NOTAS') this.notasReparacion.set(valor);
    if (objetivo === 'BUSCAR_PROVEEDOR') this.filtroProveedor.set(valor);
    
    if (objetivo === 'PRECIO') {
      const num = parseFloat(valor) || 0;
      this.precioFinal.set(num === 0 ? null : num);
    }
    if (objetivo === 'IVA') {
      this.porcentajeIva.set(parseFloat(valor) || 0);
    }
    if (objetivo === 'STOCK_INICIAL') {
      const num = parseInt(valor, 10);
      this.stockInicial.set(isNaN(num) ? null : num);
    }
    if (objetivo === 'STOCK_MINIMO') {
      const num = parseInt(valor, 10);
      this.stockMinimo.set(isNaN(num) ? null : num);
    }

    this.mostrarTecladoGeneral.set(false);
  }

  guardarArticulo(): void {
    if (!this.nombre() || this.precioFinal() === null) {
      this.uiService.mostrarToast('Por favor, rellena los campos obligatorios.', 'error');
      return;
    }

    // Comprobación a prueba de valores incorrectos o menores de 0
    const valorPrecio = this.precioFinal();
    if (valorPrecio === null || valorPrecio <= 0) {
      this.uiService.mostrarToast('El precio final debe ser mayor que 0.', 'error');
      return;
    }

    const articuloPayload = {
      nombre: this.nombre(),
      tipo: this.tipo(),
      stock: this.tipo() === 'PRODUCTO' ? this.stockInicial() : null,
      stockMinimo: this.tipo() === 'PRODUCTO' ? this.stockMinimo() : null,
      idProveedor: this.idProveedor() ? Number(this.idProveedor()) : null,
      precioFinal: this.precioFinal() ?? 0,
      porcentajeIva: this.porcentajeIva(),
      notas: this.notasReparacion().trim(),
      activo: true
    };

    const idEdicion = this.idArticuloEdicion();

    if (idEdicion) {
      this.articuloService.actualizarArticulo(idEdicion, articuloPayload).subscribe({
        next: () => {
          this.uiService.mostrarToast('Artículo actualizado con éxito', 'success');
          this.router.navigate(['/inventario']);
        },
        error: () => this.uiService.mostrarToast('Error al guardar las modificaciones', 'error')
      });
    } else {
      this.articuloService.crearArticulo(articuloPayload).subscribe({
        next: () => {
          this.uiService.mostrarToast('Artículo creado con éxito', 'success');
          this.router.navigate(['/inventario']);
        },
        error: () => this.uiService.mostrarToast('Error al crear el artículo', 'error')
      });
    }
  }

  cancelarYVolver() {
    this.mostrarTecladoGeneral.set(false);
    this.router.navigate(['/inventario']);
  }
  
  // 🎯 Cálculo de la Base Imponible en tiempo real (Solo Visual)
  precioBaseVisual = computed(() => {
    const pvp = this.precioFinal();
    const iva = this.porcentajeIva();

    if (!pvp || pvp <= 0) return '0.00';

    // Fórmula B2C: PVP / (1 + (IVA / 100))
    const baseImponible = pvp / (1 + (iva / 100));
    
    // Lo devolvemos formateado a 2 decimales para la vista
    return baseImponible.toFixed(2);
  });

}
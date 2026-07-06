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
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>('');
  mayusculas = signal<boolean>(true);

  // Listas de caracteres fijas para el renderizado del teclado
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
  lineaAcentos = ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'];

  // Caracteres dinámicos calculados según el campo objetivo
  get lineaEspecialDinamica(): string[] {
    return this.inputActivo() === 'EMAIL' 
      ? ['@', '.', '-', '_', '.com', '.es'] 
      : ['@', ',', '.', '_', '/', '-'];
  }

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
  abrirTecladoGeneralForm(objetivo: string) {
    if (isMobileOrTablet()) {
      return; 
    }
    this.inputActivo.set(objetivo);
    this.mostrarTeclado.set(true);
  }

  // Sincroniza la escritura del teclado físico nativo con las señales en vivo
  sincronizarTecladoFisico(objetivo: string, valor: string) {
    this.inputActivo.set(objetivo);
    this.actualizarValorSeñal(objetivo, valor);
  }

  escribirTeclado(caracter: string) {
    const objetivo = this.inputActivo();
    const actual = this.obtenerValorActualPorObjetivo(objetivo);

    // Evitar múltiples puntos en campos numéricos
    if (caracter === '.' && actual.includes('.')) return;
    if (actual.includes('.') && actual.split('.')[1].length >= 2 && (objetivo === 'PRECIO' || objetivo === 'IVA')) return;

    let letraFormateada = caracter;
    if (/^[a-zA-ZÑñÁÉÍÓÚÜáéíóúü]$/.test(caracter)) {
      letraFormateada = this.mayusculas() ? caracter.toUpperCase() : caracter.toLowerCase();
    }

    const nuevoValor = actual + letraFormateada;
    this.actualizarValorSeñal(objetivo, nuevoValor);
  }

  insertarEspacio() {
    const objetivo = this.inputActivo();
    const nuevoValor = this.obtenerValorActualPorObjetivo(objetivo) + ' ';
    this.actualizarValorSeñal(objetivo, nuevoValor);
  }

  borrarUltimoCaracter() {
    const objetivo = this.inputActivo();
    const nuevoValor = this.obtenerValorActualPorObjetivo(objetivo).slice(0, -1);
    this.actualizarValorSeñal(objetivo, nuevoValor);
  }

  limpiarTeclado() {
    this.actualizarValorSeñal(this.inputActivo(), '');
  }

  alternarMayusculas() {
    this.mayusculas.set(!this.mayusculas());
  }

  cerrarTeclado() {
    this.mostrarTeclado.set(false);
  }

  // Métodos auxiliares para mapear dinámicamente según el foco activo
  private obtenerValorActualPorObjetivo(objetivo: string): string {
    if (objetivo === 'NOMBRE') return this.nombre();
    if (objetivo === 'NOTAS') return this.notasReparacion();
    if (objetivo === 'BUSCAR_PROVEEDOR') return this.filtroProveedor();
    if (objetivo === 'PRECIO') return this.precioFinal()?.toString() || '';
    if (objetivo === 'IVA') return this.porcentajeIva().toString();
    if (objetivo === 'STOCK_INICIAL') return this.stockInicial()?.toString() || '';
    if (objetivo === 'STOCK_MINIMO') return this.stockMinimo()?.toString() || '';
    return '';
  }

  private actualizarValorSeñal(objetivo: string, valor: string) {
    if (objetivo === 'NOMBRE') this.nombre.set(valor);
    if (objetivo === 'NOTAS') this.notasReparacion.set(valor);
    if (objetivo === 'BUSCAR_PROVEEDOR') this.filtroProveedor.set(valor);
    
    if (objetivo === 'PRECIO') {
      const num = parseFloat(valor);
      this.precioFinal.set(isNaN(num) ? null : num);
    }
    if (objetivo === 'IVA') {
      const num = parseFloat(valor);
      this.porcentajeIva.set(isNaN(num) ? 0 : num);
    }
    if (objetivo === 'STOCK_INICIAL') {
      const num = parseInt(valor, 10);
      this.stockInicial.set(isNaN(num) ? null : num);
    }
    if (objetivo === 'STOCK_MINIMO') {
      const num = parseInt(valor, 10);
      this.stockMinimo.set(isNaN(num) ? null : num);
    }
  }

  guardarArticulo(): void {
    if (!this.nombre() || this.precioFinal() === null) {
      this.uiService.mostrarToast('Por favor, rellena los campos obligatorios.', 'error');
      return;
    }

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
    this.mostrarTeclado.set(false);
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
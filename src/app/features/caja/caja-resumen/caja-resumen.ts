import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService, TurnoCajaResponseDTO } from '../../../core/services/caja.service';
import { UiService } from '../../../core/services/ui.service';
import { isMobileOrTablet } from '../../../core/utils/device-utils';

@Component({
  selector: 'app-caja-resumen',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, CommonModule, FormsModule],
  templateUrl: './caja-resumen.html',
  styleUrl: './caja-resumen.scss'
})
export class CajaResumenComponent implements OnInit {
  private cajaService = inject(CajaService);
  private uiService = inject(UiService);

  // Enlazamos directamente con el Signal globalizado del servicio
  cajaActual = this.cajaService.cajaActual;
  cargando = signal<boolean>(true);

  // Almacena el reporte final tras el cierre para seguir mostrándolo en pantalla
  ultimaCajaCerrada = signal<TurnoCajaResponseDTO | null>(null);

  // Modales táctiles (Signals)
  mostrarModalMovimiento = signal<boolean>(false);
  mostrarModalCierre = signal<boolean>(false);
  mostrarModalPdf = signal<boolean>(false);
  mostrarModalApertura = signal<boolean>(false);

  // Variables de control de datos
  idCajaCerrada = signal<number | null>(null); // 🚀 Corregido a Signal
  montoMovimiento: number = 0;
  descripcionMovimiento: string = '';
  tipoMovimientoSeleccionado: 'INGRESO_EXTRA' | 'GASTO_EXTRA' = 'INGRESO_EXTRA';
  
  saldoFinalRealContado: number = 0;
  montoApertura: number = 0;

  // Computado unificado para saber qué datos pintar en el informe (activa o recién cerrada)
  datosInforme = computed<TurnoCajaResponseDTO | null>(() => this.cajaActual() ?? this.ultimaCajaCerrada());

  // DEJAMOS EL DESCUADRE (Porque lleva lógica condicional de fallback)
  descuadre = computed(() => this.datosInforme()?.descuadre ?? 0);

  // --- CONTROL DEL TECLADO TÁCTIL INTEGRADO ---
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>('');
  terminoBusqueda = signal<string>('');
  ordenes = signal<any[]>([]);
  mayusculas = signal<boolean>(true);

  // Distribución de teclas para el teclado táctil del TPV
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_', '.'];
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  // Variables temporales para mostrar el texto en el teclado táctil mientras se escribe
  textoMontoTmp = '';
  textoSaldoTmp = '';
  textoAperturaTmp = '';

  // Si queremos abrir caja desde esta terminal
  abrirModalApertura() {
  this.montoApertura = 0;
  this.textoAperturaTmp = '';
  this.mostrarModalApertura.set(true);
}

  claseMovimiento(tipo: string): string {
    return tipo === 'INGRESO_EXTRA' ? 'badge-ingreso' : 'badge-gasto';
  }

  iconoMovimiento(tipo: string): string {
    return tipo === 'INGRESO_EXTRA' ? '📥' : '📤';
  }

  ngOnInit(): void {
    this.cargarCaja();
  }

 cargarCaja() {
    this.cargando.set(true);
    // Comprobamos si hay turno activo en el TPV
    this.cajaService.checkEstadoCaja().subscribe({
      next: (res) => {
        if (res) {
          // Si hay caja activa, el informe es la caja actual, limpiamos snapshot histórico
          this.ultimaCajaCerrada.set(null);
          this.cargando.set(false);
        } else {
          // 🚀 NO hay caja activa. Tiramos del servicio para rescatar el último turno del histórico
          this.cajaService.obtenerUltimoCierreHistorico().subscribe({
            next: (ultimoCierre) => {
              if (ultimoCierre) {
                this.ultimaCajaCerrada.set(ultimoCierre);
              }
              this.cargando.set(false);
            },
            // Si falla o no hay histórico (caso de base de datos vacía de prueba), cerramos carga sin romper nada
            error: () => this.cargando.set(false)
          });
        }
      },
      error: (err: any) => {
        console.error("Error al recuperar la caja", err);
        this.uiService.mostrarToast('Error al conectar con la caja física.', 'error');
        this.cargando.set(false);
      }
    });
  }

  guardarMovimientoManual() {
    if (this.montoMovimiento <= 0 || !this.descripcionMovimiento.trim()) {
      this.uiService.mostrarToast('Por favor, completa todos los campos obligatorios.', 'warning');
      return;
    }

    const payload = {
      tipoMovimiento: this.tipoMovimientoSeleccionado,
      importe: this.montoMovimiento,
      descripcion: this.descripcionMovimiento
    };

    this.cajaService.registrarMovimientoManual(payload).subscribe({
      next: () => {
        this.mostrarModalMovimiento.set(false);
        this.montoMovimiento = 0;
        this.descripcionMovimiento = '';
        this.uiService.mostrarToast('Movimiento registrado en el cajón.', 'success');
        this.cargarCaja();
      },
      error: (err: any) => this.uiService.mostrarToast("Error al registrar movimiento: " + err.error, 'error')
    });
  }

  ejecutarCierreCaja() {
    if (this.saldoFinalRealContado === null || this.saldoFinalRealContado < 0) {
      this.uiService.mostrarToast("Introduce un arqueo de efectivo válido.", 'warning');
      return;
    }

    this.cajaService.cerrarCaja(this.saldoFinalRealContado).subscribe({
      next: (cajaCerrada) => {
        this.idCajaCerrada.set(cajaCerrada.id);
        // Guardamos el snapshot completo devuelto por el backend con el descuadre calculado
        this.ultimaCajaCerrada.set(cajaCerrada);
        this.mostrarModalCierre.set(false);
        this.uiService.mostrarToast('Turno de caja cerrado correctamente.', 'success');
        this.mostrarModalPdf.set(true); // Abre el selector del reporte post-cierre
        // Sincroniza el estado (pasará a null en cajaActual, pero mantendremos el informe por el snapshot)
        this.cargarCaja();
      },
      error: (err: any) => this.uiService.mostrarToast("Error al cerrar: " + err.error, 'error')
    });
  }

  ejecutarAperturaCaja() {
    if (this.montoApertura < 0) {
      this.uiService.mostrarToast("Introduce un monto inicial válido.", 'warning');
      return;
    }
    // Llama al método correspondiente de tu CajaService (ej: abrirCaja)
    this.cajaService.abrirCaja(this.montoApertura).subscribe({
      next: () => {
        this.uiService.mostrarToast("Caja abierta con éxito.", "success");
        this.mostrarModalApertura.set(false);
        this.ultimaCajaCerrada.set(null); // Reseteamos el estado viejo
        this.cargarCaja();
      },
      error: (err: any) => this.uiService.mostrarToast("Error al abrir caja: " + err.error, "error")
    });
  }

  verPdf(id: number, formato: '80mm' | 'a4') {
    const peticion = formato === '80mm' 
      ? this.cajaService.descargarPdf80mm(id) 
      : this.cajaService.descargarPdfA4(id);

    peticion.subscribe({
      next: (blob: Blob) => { // 🚀 Tipado de parámetro
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => this.uiService.mostrarToast("No se pudo escupir el reporte PDF.", 'error')
    });
  }

  imprimirInformeFinal(formato: '80mm' | 'a4') {
    const id = this.idCajaCerrada();
    if (id) {
      this.verPdf(id, formato);
    }
    this.mostrarModalPdf.set(false);
    this.idCajaCerrada.set(null);
  }

// Abre el teclado y registra sobre qué campo estamos trabajando
activarTeclado(campo: string) {
  // Si el zapatero gestiona la caja desde la tablet, anulamos vuestro teclado virtual
  if (isMobileOrTablet()) {
    return;
  }
 this.inputActivo.set(campo);
  this.mostrarTeclado.set(true);

  // Al activar, cargamos lo que ya haya en los inputs para poder seguir editando
  if (campo === 'monto') {
    this.textoMontoTmp = this.montoMovimiento ? this.montoMovimiento.toString() : '';
  } else if (campo === 'saldoFinalRealContado') {
    this.textoSaldoTmp = this.saldoFinalRealContado ? this.saldoFinalRealContado.toString() : '';
  } else if (campo === 'montoApertura') {
    /* 🆕 Añadido: Cargamos el fondo de caja inicial si ya se había tecleado algo */
    this.textoAperturaTmp = this.montoApertura ? this.montoApertura.toString() : '';
  }
}

// Cierra el panel del teclado
cerrarTeclado() {
  this.mostrarTeclado.set(false);
  this.inputActivo.set('');
}

escribirTeclado(caracter: string) {
  const campo = this.inputActivo();
  if (!campo) return;

  // Transformamos el carácter según el estado de las mayúsculas solo si es una letra
  const esLetra = caracter.length === 1 && caracter.toLowerCase() !== caracter.toUpperCase() || caracter === 'Ñ' || caracter === 'ñ';
  if (esLetra) {
    caracter = this.mayusculas() ? caracter.toUpperCase() : caracter.toLowerCase();
  }
  
  // Control para el Concepto / Motivo (Texto normal)
  if (campo === 'descripcion') {
    this.descripcionMovimiento = (this.descripcionMovimiento || '') + caracter;
    return;
  }

  // Control para campos numéricos de la caja (Importe y Cierre Real)
  if (campo === 'monto') {
    if (caracter === '.' && this.textoMontoTmp.includes('.')) return;
    this.textoMontoTmp += caracter;
    this.montoMovimiento = parseFloat(this.textoMontoTmp) || 0;
  } else if (campo === 'saldoFinalRealContado') {
    if (caracter === '.' && this.textoSaldoTmp.includes('.')) return;
    this.textoSaldoTmp += caracter;
    this.saldoFinalRealContado = parseFloat(this.textoSaldoTmp) || 0;
  } else if (campo === 'montoApertura') {
    if (caracter === '.' && this.textoAperturaTmp.includes('.')) return;
    this.textoAperturaTmp += caracter;
    this.montoApertura = parseFloat(this.textoAperturaTmp) || 0;
  }
}

alternarMayusculas() {
  this.mayusculas.set(!this.mayusculas());
}

limpiarTeclado() {
  const campo = this.inputActivo();
  if (!campo) return;
  this.sincronizarTecladoFisicoCaja(campo, '');
}

// Borrar el último carácter (Tecla Retroceso ⌫)
borrarUltimoCaracter() {
  const campo = this.inputActivo();
  if (!campo) return;

  if (campo === 'descripcion') {
    this.descripcionMovimiento = this.descripcionMovimiento ? this.descripcionMovimiento.slice(0, -1) : '';
    return;
  } else if (campo === 'monto') {
    this.textoMontoTmp = this.textoMontoTmp.slice(0, -1);
    this.montoMovimiento = parseFloat(this.textoMontoTmp) || 0;
  } else if (campo === 'saldoFinalRealContado') {
    this.textoSaldoTmp = this.textoSaldoTmp.slice(0, -1);
    this.saldoFinalRealContado = parseFloat(this.textoSaldoTmp) || 0;
  } else if (campo === 'montoApertura') {
      this.textoAperturaTmp = this.textoAperturaTmp.slice(0, -1);
      this.montoApertura = parseFloat(this.textoAperturaTmp) || 0;
  }
}

// Añadir espacio (Tecla Espaciadora)
insertarEspacio() {
  const campo = this.inputActivo();
  if (!campo) return;

  if (campo === 'busqueda') {
    this.terminoBusqueda.set(this.terminoBusqueda() + ' ');
  } else if (campo === 'descripcion') {
    // Forzamos la mutación de la cadena para que Angular detecte el cambio de espacio en el input
    this.escribirTeclado(' ');
  }
}

 sincronizarTecladoFisicoCaja(campo: string, valor: string) {
  // En lugar de un Signal global, sincronizamos los strings temporales correspondientes (los buffers de texto)
  if (campo === 'monto') {
    this.textoMontoTmp = valor;
    this.montoMovimiento = parseFloat(valor) || 0;
  } else if (campo === 'saldoFinalRealContado') {
    this.textoSaldoTmp = valor;
    this.saldoFinalRealContado = parseFloat(valor) || 0;
  } else if (campo === 'montoApertura') {
    this.textoAperturaTmp = valor;
    this.montoApertura = parseFloat(valor) || 0;
  } else if (campo === 'descripcion') {
    // La descripción usa directamente la variable maestra sin temporales
    this.descripcionMovimiento = valor;
  }
 }
 
}
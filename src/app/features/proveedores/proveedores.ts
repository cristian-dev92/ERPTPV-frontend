import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProveedorService, ProveedorDTO, NuevoProveedorRequest } from '../../core/services/proveedor.service';
import { UiService } from '../../core/services/ui.service'; // Ajusta la ruta a tu servicio de notificaciones

@Component({
  selector: 'app-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proveedores.html',
  styleUrl: './proveedores.scss'
})
export class ProveedoresComponent implements OnInit {
  private proveedorService = inject(ProveedorService);
  private uiService = inject(UiService);

  // === ESTADOS REACTIVOS ===
  proveedores = signal<ProveedorDTO[]>([]);
  mostrarModalRegistro = signal<boolean>(false);

  // 🔍 ESTADOS DE BÚSQUEDA Y TECLADO
  filtroBusqueda = signal<string>('');
  mostrarTecladoGeneral = signal<boolean>(false);
  inputObjetivoTeclado = signal<string>('');
  valorTecladoEnConstruccion = signal<string>('');

  // Molde vacío para el formulario
  nuevoProveedor = signal<NuevoProveedorRequest>({
    nombre: '',
    cif: '',
    emailPedidos: '',
    telefono: '',
    direccion: ''
  });

  // 🎯 FILTRADO AUTOMÁTICO EN TIEMPO REAL (Client-side con Signals)
  proveedoresFiltrados = computed(() => {
    const filtro = this.filtroBusqueda().toLowerCase().trim();
    if (!filtro) return this.proveedores();
    
    return this.proveedores().filter(p => 
      p.nombre.toLowerCase().includes(filtro) ||
      (p.cif && p.cif.toLowerCase().includes(filtro)) ||
      (p.telefono && p.telefono.includes(filtro))
    );
  });

  ngOnInit() {
    this.cargarProveedores();
  }

  cargarProveedores() {
    this.proveedorService.obtenerMisProveedores().subscribe({
      next: (data) => this.proveedores.set(data),
      error: (err) => this.uiService.mostrarToast('Error al cargar proveedores: ' + err.message, 'error')
    });
  }

  buscarProveedores() {
    // Nota: Gracias al 'computed' (proveedoresFiltrados), la lista se actualiza sola.
    // Dejamos este método por consistencia con la barra de búsqueda.
  }

  // === LÓGICA DEL TECLADO TÁCTIL VIRTUAL ===
  abrirTecladoGeneralForm(
    objetivo: 'NOMBRE' | 'TELEFONO' | 'CIF' | 'EMAIL' | 'DIRECCION' | 'BUSQUEDA', 
    index?: number | null, 
    valorActualForm: string = ''
  ) {
    this.inputObjetivoTeclado.set(objetivo);
    this.valorTecladoEnConstruccion.set(valorActualForm || '');
    this.mostrarTecladoGeneral.set(true);
  }

  cerrarTecladoGeneral() {
    this.mostrarTecladoGeneral.set(false);
  }

  pulsarTeclaGeneral(caracter: string) {
    this.valorTecladoEnConstruccion.update(val => val + caracter);
  }

  borrarUltimoCaracterGeneral() {
    this.valorTecladoEnConstruccion.update(val => val.slice(0, -1));
  }

  limpiarTecladoGeneral() {
    this.valorTecladoEnConstruccion.set('');
  }

  aplicarTextoAlFormulario() {
    const objetivo = this.inputObjetivoTeclado();
    const valor = this.valorTecladoEnConstruccion();

    if (objetivo === 'BUSQUEDA') {
      this.filtroBusqueda.set(valor);
    } else {
      this.nuevoProveedor.update(prov => {
        const actualizado = { ...prov };
        if (objetivo === 'NOMBRE') actualizado.nombre = valor;
        if (objetivo === 'CIF') actualizado.cif = valor;
        if (objetivo === 'TELEFONO') actualizado.telefono = valor;
        if (objetivo === 'EMAIL') actualizado.emailPedidos = valor.toLowerCase();
        if (objetivo === 'DIRECCION') actualizado.direccion = valor;
        return actualizado;
      });
    }
    
    this.mostrarTecladoGeneral.set(false);
  }

  abrirModal() {
    this.nuevoProveedor.set({
      nombre: '',
      cif: '',
      emailPedidos: '',
      telefono: '',
      direccion: ''
    });
    this.mostrarModalRegistro.set(true);
  }

  cerrarModal() {
    this.mostrarModalRegistro.set(false);
  }

  guardarProveedor() {
    const datos = this.nuevoProveedor();
    
    if (!datos.nombre.trim()) {
      this.uiService.mostrarToast('El nombre del proveedor es obligatorio', 'warning');
      return;
    }

    this.proveedorService.crearProveedor(datos).subscribe({
      next: (proveedorCreado) => {
        this.uiService.mostrarToast(`📦 Proveedor "${proveedorCreado.nombre}" registrado con éxito`, 'success');
        
        // Actualizamos la lista local añadiendo el nuevo al principio
        this.proveedores.update(list => [proveedorCreado, ...list]);
        this.cerrarModal();
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al crear proveedor: ' + (err.error || err.message), 'error');
      }
    });
  }
}
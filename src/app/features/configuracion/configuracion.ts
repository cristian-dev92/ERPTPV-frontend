import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../core/services/ui.service'; // Tu servicio de toasts/notificaciones

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss'
})
export class ConfiguracionComponent {
  private uiService = inject(UiService);

  // --- DATOS PERFIL PROPIO (MOCK) ---
  emailActual = signal<string>('');
  inputEmail = 'admin@zapateria-multitenant.com';
  passActual = '';
  nuevaPass = '';
  confirmarPass = '';
  nombreFirmaCargada = signal<string | null>(null);

  // --- DATOS GESTIÓN USUARIOS EMPRESA (MOCK) ---
  usuariosEmpresa = signal<any[]>([
    { id: 1, nombre: 'Cristian Pepe', email: 'cristian@zapateria.com', rol: 'PROPIETARIO' },
    { id: 2, nombre: 'Lucas Empleado', email: 'lucas@zapateria.com', rol: 'EMPLEADO_TALLER' },
    { id: 3, nombre: 'Sara Caja', email: 'sara@zapateria.com', rol: 'EMPLEADO_CAJA' }
  ]);

  usuarioSeleccionado = signal<any | null>(null);
  nuevaPassUsuario = '';
  nuevoEmailUsuario = '';

  // --- CONFIGURACIÓN TECLADO TÁCTIL ---
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>('');

  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '@'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ', '.'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_', 'com'];
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  // Buffers temporales para escritura fluida
  textoEmailTmp = 'admin@zapateria-multitenant.com';
  textoPassActualTmp = '';
  textoNuevaPassTmp = '';
  textoConfirmarPassTmp = '';
  textoUserEmailTmp = '';
  textoUserPassTmp = '';

  // --- MÉTODOS TECLADO TÁCTIL ---
  activarTeclado(campo: string) {
    this.inputActivo.set(campo);
    this.mostrarTeclado.set(true);

    // Mapeamos el estado actual al buffer al hacer click
    if (campo === 'inputEmail') this.textoEmailTmp = this.inputEmail;
    if (campo === 'passActual') this.textoPassActualTmp = this.passActual;
    if (campo === 'nuevaPass') this.textoNuevaPassTmp = this.nuevaPass;
    if (campo === 'confirmarPass') this.textoConfirmarPassTmp = this.confirmarPass;
    if (campo === 'nuevoEmailUsuario') this.textoUserEmailTmp = this.nuevoEmailUsuario;
    if (campo === 'nuevaPassUsuario') this.textoUserPassTmp = this.nuevaPassUsuario;
  }

  cerrarTeclado() {
    this.mostrarTeclado.set(false);
    this.inputActivo.set('');
  }

  escribirTeclado(caracter: string) {
    const campo = this.inputActivo();
    if (!campo) return;

    // Tratamos el atajo '.com'
    const valorAInsertar = caracter === 'com' ? '.com' : caracter;

    if (campo === 'inputEmail') { this.textoEmailTmp += valorAInsertar; this.inputEmail = this.textoEmailTmp; }
    if (campo === 'passActual') { this.textoPassActualTmp += valorAInsertar; this.passActual = this.textoPassActualTmp; }
    if (campo === 'nuevaPass') { this.textoNuevaPassTmp += valorAInsertar; this.nuevaPass = this.textoNuevaPassTmp; }
    if (campo === 'confirmarPass') { this.textoConfirmarPassTmp += valorAInsertar; this.confirmarPass = this.textoConfirmarPassTmp; }
    if (campo === 'nuevoEmailUsuario') { this.textoUserEmailTmp += valorAInsertar; this.nuevoEmailUsuario = this.textoUserEmailTmp; }
    if (campo === 'nuevaPassUsuario') { this.textoUserPassTmp += valorAInsertar; this.nuevaPassUsuario = this.textoUserPassTmp; }
  }

  borrarUltimoCaracter() {
    const campo = this.inputActivo();
    if (!campo) return;

    if (campo === 'inputEmail') { this.textoEmailTmp = this.textoEmailTmp.slice(0, -1); this.inputEmail = this.textoEmailTmp; }
    if (campo === 'passActual') { this.textoPassActualTmp = this.textoPassActualTmp.slice(0, -1); this.passActual = this.textoPassActualTmp; }
    if (campo === 'nuevaPass') { this.textoNuevaPassTmp = this.textoNuevaPassTmp.slice(0, -1); this.nuevaPass = this.textoNuevaPassTmp; }
    if (campo === 'confirmarPass') { this.textoConfirmarPassTmp = this.textoConfirmarPassTmp.slice(0, -1); this.confirmarPass = this.textoConfirmarPassTmp; }
    if (campo === 'nuevoEmailUsuario') { this.textoUserEmailTmp = this.textoUserEmailTmp.slice(0, -1); this.nuevoEmailUsuario = this.textoUserEmailTmp; }
    if (campo === 'nuevaPassUsuario') { this.textoUserPassTmp = this.textoUserPassTmp.slice(0, -1); this.nuevaPassUsuario = this.textoUserPassTmp; }
  }

  insertarEspacio() {
    this.escribirTeclado(' ');
  }

  // --- ACCIONES PERFIL ---
  guardarCredencialesPropias() {
    if (!this.inputEmail.trim()) {
      this.uiService.mostrarToast('El email no puede estar vacío.', 'warning');
      return;
    }
    this.emailActual.set(this.inputEmail);
    this.uiService.mostrarToast('Credenciales de acceso actualizadas (Local).', 'success');
  }

  solicitarCambioPassword() {
    if (!this.passActual || !this.nuevaPass || !this.confirmarPass) {
      this.uiService.mostrarToast('Completa todos los campos de contraseña.', 'warning');
      return;
    }
    if (this.nuevaPass !== this.confirmarPass) {
      this.uiService.mostrarToast('Las nuevas contraseñas no coinciden.', 'error');
      return;
    }
    this.passActual = ''; this.nuevaPass = ''; this.confirmarPass = '';
    this.uiService.mostrarToast('Contraseña cambiada correctamente.', 'success');
  }

  onFirmaSeleccionada(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.nombreFirmaCargada.set(file.name);
      this.uiService.mostrarToast(`Firma "${file.name}" cargada correctamente.`, 'success');
    }
  }

  // --- ACCIONES GESTIÓN DE TERCEROS ---
  seleccionarUsuario(usuario: any) {
    this.usuarioSeleccionado.set(usuario);
    this.nuevoEmailUsuario = usuario.email;
    this.nuevaPassUsuario = '';
  }

  guardarCambiosUsuario() {
    const usr = this.usuarioSeleccionado();
    if (!usr) return;

    // Actualizamos el mock localmente
    this.usuariosEmpresa.update(lista => lista.map(u => {
      if (u.id === usr.id) {
        return { ...u, email: this.nuevoEmailUsuario };
      }
      return u;
    }));

    if (this.nuevaPassUsuario.trim()) {
      this.uiService.mostrarToast(`Contraseña de ${usr.nombre} reseteada con éxito.`, 'success');
    }

    this.uiService.mostrarToast(`Credenciales de ${usr.nombre} actualizadas.`, 'success');
    this.usuarioSeleccionado.set(null);
  }
}
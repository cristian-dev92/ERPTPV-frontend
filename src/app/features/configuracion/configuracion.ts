import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../core/services/ui.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss'
})
export class ConfiguracionComponent implements OnInit {
  private configService = inject(ConfiguracionService);
  private uiService = inject(UiService);

  // --- ESTADOS DE CARGA ---
  loading = signal<boolean>(false);
  mostrarFormularioNuevo = signal<boolean>(false);

  // --- DATOS PERFIL PROPIO (MOCK) ---
  emailActual = signal<string>('');
  inputEmail = '';
  passActual = '';
  nuevaPass = '';
  confirmarPass = '';
  nombreFirmaCargada = signal<string | null>(null);
  nombreLogoCargado = signal<string | null>(null);

  // --- DATOS GESTIÓN USUARIOS EMPRESA (CONECTADO A BACKEND) ---
  usuariosEmpresa = signal<any[]>([]);
  usuarioSeleccionado = signal<any | null>(null);
  nuevaPassUsuario = '';
  nuevoEmailUsuario = '';

  // --- FORMULARIO NUEVO EMPLEADO (NuevoEmpleadoRequest) ---
  nuevoEmpleado = {
    nombre: '',
    email: '',
    password: '',
    rol: 'EMPLEADO'
  };

  // --- CONFIGURACIÓN TECLADO TÁCTIL ---
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>('');

  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '@'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ', '.'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_', 'com'];
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  // Buffers temporales para escritura fluida
  textoEmailTmp = '';
  textoPassActualTmp = '';
  textoNuevaPassTmp = '';
  textoConfirmarPassTmp = '';
  textoUserEmailTmp = '';
  textoUserPassTmp = '';

  // Nuevos buffers para el alta de operarios
  textoNuevoEmpNombreTmp = '';
  textoNuevoEmpEmailTmp = '';
  textoNuevoEmpPassTmp = '';

  ngOnInit(): void {
    this.obtenerPersonalAutorizado();
  }

  /**
   * Carga la lista de empleados reales desde la base de datos
   */
  obtenerPersonalAutorizado(): void {
    this.configService.listarEmpleados().subscribe({
      next: (empleados) =>
        this.usuariosEmpresa.set(empleados),
      error: () => this.uiService.mostrarToast('Error al obtener la lista de operarios.', 'error')
    });
  }

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
    if (campo === 'nuevoEmpNombre') this.textoNuevoEmpNombreTmp = this.nuevoEmpleado.nombre;
    if (campo === 'nuevoEmpEmail') this.textoNuevoEmpEmailTmp = this.nuevoEmpleado.email;
    if (campo === 'nuevoEmpPass') this.textoNuevoEmpPassTmp = this.nuevoEmpleado.password;
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
    if (campo === 'nuevoEmpNombre') { this.textoNuevoEmpNombreTmp += valorAInsertar; this.nuevoEmpleado.nombre = this.textoNuevoEmpNombreTmp; }
    if (campo === 'nuevoEmpEmail') { this.textoNuevoEmpEmailTmp += valorAInsertar; this.nuevoEmpleado.email = this.textoNuevoEmpEmailTmp; }
    if (campo === 'nuevoEmpPass') { this.textoNuevoEmpPassTmp += valorAInsertar; this.nuevoEmpleado.password = this.textoNuevoEmpPassTmp; }
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
    if (campo === 'nuevoEmpNombre') { this.textoNuevoEmpNombreTmp = this.textoNuevoEmpNombreTmp.slice(0, -1); this.nuevoEmpleado.nombre = this.textoNuevoEmpNombreTmp; }
    if (campo === 'nuevoEmpEmail') { this.textoNuevoEmpEmailTmp = this.textoNuevoEmpEmailTmp.slice(0, -1); this.nuevoEmpleado.email = this.textoNuevoEmpEmailTmp; }
    if (campo === 'nuevoEmpPass') { this.textoNuevoEmpPassTmp = this.textoNuevoEmpPassTmp.slice(0, -1); this.nuevoEmpleado.password = this.textoNuevoEmpPassTmp; }
  }

  insertarEspacio() {
    this.escribirTeclado(' ');
  }

  // --- ACCIONES PERFIL ---
  solicitarCambioPassword() {
    if (!this.passActual || !this.nuevaPass || !this.confirmarPass) {
      this.uiService.mostrarToast('Completa todos los campos de contraseña.', 'warning');
      return;
    }
    if (this.nuevaPass !== this.confirmarPass) {
      this.uiService.mostrarToast('Las nuevas contraseñas no coinciden.', 'error');
      return;
    }
   this.loading.set(true);
    const payload = {
      passwordActual: this.passActual,
      nuevaPassword: this.nuevaPass
    };

    this.configService.cambiarMiPassword(payload).subscribe({
      next: () => {
        this.uiService.mostrarToast('Tu contraseña ha sido actualizada correctamente.', 'success');
        this.passActual = ''; this.nuevaPass = ''; this.confirmarPass = '';
        this.loading.set(false);
      },
      error: (err) => {
        this.uiService.mostrarToast(err.error?.mensaje || 'Error al cambiar tu contraseña.', 'error');
        this.loading.set(false);
      }
    });
  }

  /**
   * Sube la firma digital del propietario al StorageService y la guarda
   */
  onFirmaSeleccionada(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    this.uiService.mostrarToast('Subiendo archivo de firma...', 'warning');

    this.configService.subirArchivo(file, 'firma').subscribe({
      next: (res) => {
        this.nombreFirmaCargada.set(file.name);
        // Una vez subido el archivo físico, guardamos la URL en el perfil
        this.configService.guardarMiFirma(res.url).subscribe({
          next: () => {
            this.uiService.mostrarToast('Firma digital vinculada correctamente en tu perfil.', 'success');
          }
        });
      },
      error: () => {
        this.uiService.mostrarToast('Error al procesar la subida de la firma.', 'error');
      }
    });
  }

  // Logo de la empresa
  onLogoSeleccionado(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.configService.subirArchivo(file, 'logo').subscribe({
      next: (res) => {
        this.nombreLogoCargado.set(file.name);
        this.uiService.mostrarToast('Logotipo comercial actualizado con éxito.', 'success');
      },
      error: (err) => this.uiService.mostrarToast(err.error || 'Solo el Administrador puede cambiar el logo.', 'error')
    });
  }

  // --- ACCIONES GESTIÓN DE TERCEROS ---
  seleccionarUsuario(usuario: any) {
    this.mostrarFormularioNuevo.set(false);
    this.usuarioSeleccionado.set(usuario);
    this.nuevoEmailUsuario = usuario.email;
    this.nuevaPassUsuario = '';
  }

  crearNuevoOperario() {
    if (!this.nuevoEmpleado.nombre || !this.nuevoEmpleado.email || !this.nuevoEmpleado.password) {
      this.uiService.mostrarToast('Por favor, rellena todos los campos del operario.', 'warning');
      return;
    }

    this.loading.set(true);
    this.configService.crearEmpleado(this.nuevoEmpleado).subscribe({
      next: () => {
        this.uiService.mostrarToast(`Operario ${this.nuevoEmpleado.nombre} creado correctamente.`, 'success');
        this.nuevoEmpleado = { nombre: '', email: '', password: '', rol: 'EMPLEADO' };
        this.mostrarFormularioNuevo.set(false);
        this.loading.set(false);
        this.obtenerPersonalAutorizado();
      },
      error: (err) => {
        this.uiService.mostrarToast(err.error || 'Error al crear el empleado.', 'error');
        this.loading.set(false);
      }
    });
  }

  ejecutarResetPasswordEmpleado() {
    const usr = this.usuarioSeleccionado();
    if (!usr) return;

    this.loading.set(true);
    this.configService.resetearPasswordEmpleado(usr.id).subscribe({
      next: (res) => {
        // El backend nos devuelve la contraseña temporal generada en res.passwordTemporal
        this.nuevaPassUsuario = res.passwordTemporal;
        this.uiService.mostrarToast(`¡Contraseña restablecida con éxito para ${usr.nombre}!`, 'success');
        this.loading.set(false);
      },
      error: (err) => {
        this.uiService.mostrarToast(err.error?.mensaje || 'Error al resetear la clave del operario.', 'error');
        this.loading.set(false);
      }
    });
  }

  darDeBajaEmpleado() {
    const usr = this.usuarioSeleccionado();
    if (!usr) return;

    // Como tu compañero no ha creado el Endpoint DELETE en el backend todavía, avisamos en local
    this.uiService.mostrarToast(
      `El backend no dispone de DELETE /api/admin/empleados/${usr.id}. Pídeselo a tu compañero para activar la baja real de ${usr.nombre}.`, 
      'warning'
    );
  }

}
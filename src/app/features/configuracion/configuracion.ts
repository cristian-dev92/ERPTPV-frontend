import { Component, inject, OnInit, signal, computed } from '@angular/core';
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

  // --- VISIBILIDAD DE CONTRASEÑAS (Ojo para ver puntitos) ---
  verPassActual = signal<boolean>(false);
  verNuevaPass = signal<boolean>(false);
  verConfirmarPass = signal<boolean>(false);
  verPassNuevoEmp = signal<boolean>(false);

  // --- DATOS PERFIL PROPIO ---
  emailActual = signal<string>('admin@empresaprueba.com'); // Debería venir de tu AuthService
  inputEmail = '';
  passActual = '';
  nuevaPass = '';
  confirmarPass = '';
  nombreFirmaCargada = signal<string | null>(null);
  nombreLogoCargado = signal<string | null>(null);

  // --- DATOS GESTIÓN USUARIOS EMPRESA ---
  usuariosEmpresa = signal<any[]>([]);
  usuarioSeleccionado = signal<any | null>(null);
  nuevaPassUsuario = '';
  nuevoEmailUsuario = '';

  // --- FORMULARIO NUEVO EMPLEADO ---
  nuevoEmpleado = {
    nombre: '',
    email: '',
    password: '',
    rol: 'EMPLEADO' // 'EMPLEADO' | 'ADMIN'
  };

  // --- CONFIGURACIÓN TECLADO TÁCTIL ---
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>('');
  mayusculas = signal<boolean>(true); // NUEVO: Estado para alternar Mayús/Minús

  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '@'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ', '.'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_', 'com'];
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  // Buffers temporales
  textoEmailTmp = '';
  textoPassActualTmp = '';
  textoNuevaPassTmp = '';
  textoConfirmarPassTmp = '';
  textoUserEmailTmp = '';
  textoUserPassTmp = '';
  textoNuevoEmpNombreTmp = '';
  textoNuevoEmpEmailTmp = '';
  textoNuevoEmpPassTmp = '';

  ngOnInit(): void {
    this.obtenerPersonalAutorizado();
  }

  obtenerPersonalAutorizado(): void {
    this.configService.listarEmpleados().subscribe({
      next: (empleados) => this.usuariosEmpresa.set(empleados),
      error: () => this.uiService.mostrarToast('Error al obtener la lista de operarios.', 'error')
    });
  }

  // --- MÉTODOS TECLADO TÁCTIL (CORREGIDO PARA MEMORIZAR Y SINCRONIZAR FÍSICO) ---
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

  // 🚀 NUEVO: Sincroniza lo que el usuario escribe físicamente con los buffers internos del teclado virtual
  sincronizarTecladoFisico(campo: string, valorActual: string) {
    if (campo === 'inputEmail') { this.inputEmail = valorActual; this.textoEmailTmp = valorActual; }
    if (campo === 'passActual') { this.passActual = valorActual; this.textoPassActualTmp = valorActual; }
    if (campo === 'nuevaPass') { this.nuevaPass = valorActual; this.textoNuevaPassTmp = valorActual; }
    if (campo === 'confirmarPass') { this.confirmarPass = valorActual; this.textoConfirmarPassTmp = valorActual; }
    if (campo === 'nuevoEmailUsuario') { this.nuevoEmailUsuario = valorActual; this.textoUserEmailTmp = valorActual; }
    if (campo === 'nuevaPassUsuario') { this.nuevaPassUsuario = valorActual; this.textoUserPassTmp = valorActual; }
    if (campo === 'nuevoEmpNombre') { this.nuevoEmpleado.nombre = valorActual; this.textoNuevoEmpNombreTmp = valorActual; }
    if (campo === 'nuevoEmpEmail') { this.nuevoEmpleado.email = valorActual; this.textoNuevoEmpEmailTmp = valorActual; }
    if (campo === 'nuevoEmpPass') { this.nuevoEmpleado.password = valorActual; this.textoNuevoEmpPassTmp = valorActual; }
  }

  cerrarTeclado() {
    this.mostrarTeclado.set(false);
    this.inputActivo.set('');
  }

  // MEJORADO: Ahora respeta si está activo el modo mayúsculas o minúsculas
  escribirTeclado(caracter: string) {
    const campo = this.inputActivo();
    if (!campo) return;

    let valorAInsertar = caracter === 'com' ? '.com' : caracter;
    
    // Si no es un carácter especial o número, aplicamos la transformación de caja
    if (caracter !== 'com' && !this.lineaNumeros.includes(caracter) && caracter !== '-' && caracter !== '_' && caracter !== '.' && caracter !== '@') {
      valorAInsertar = this.mayusculas() ? caracter.toUpperCase() : caracter.toLowerCase();
    }

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

  alternarMayusculas() {
    this.mayusculas.set(!this.mayusculas());
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

  onFirmaSeleccionada(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;
    this.uiService.mostrarToast('Subiendo archivo de firma...', 'warning');
    this.configService.subirArchivo(file, 'firma').subscribe({
      next: (res) => {
        this.nombreFirmaCargada.set(file.name);
        this.configService.guardarMiFirma(res.url).subscribe({
          next: () => this.uiService.mostrarToast('Firma digital vinculada correctamente.', 'success')
        });
      },
      error: () => this.uiService.mostrarToast('Error al procesar la subida de la firma.', 'error')
    });
  }

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

  // --- GESTIÓN DE TERCEROS ---
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

    // VOLVEMOS AL ROL LIMPIO: Enviamos exactamente lo que el backend espera ("EMPLEADO" o "ADMIN")
    const payloadAlta = {
      nombre: this.nuevoEmpleado.nombre,
      email: this.nuevoEmpleado.email,
      password: this.nuevoEmpleado.password,
      rol: this.nuevoEmpleado.rol // Enviará "EMPLEADO" o "ADMIN" sin prefijos
    };

    this.configService.crearEmpleado(payloadAlta).subscribe({
      next: () => {
        this.uiService.mostrarToast(`Operario ${this.nuevoEmpleado.nombre} creado correctamente con permisos de acceso.`, 'success');
        this.nuevoEmpleado = { nombre: '', email: '', password: '', rol: 'EMPLEADO' };
        this.mostrarFormularioNuevo.set(false);
        this.loading.set(false);
        this.obtenerPersonalAutorizado();
      },
      error: (err) => {
        console.error('Error detallado del backend:', err);
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

    // FIX: Impedir que el administrador en sesión se de de baja a sí mismo y rompa el tenant
    if (usr.email === this.emailActual() || usr.rol === 'ADMIN' && this.usuariosEmpresa().filter(u => u.rol === 'ADMIN').length === 1) {
      this.uiService.mostrarToast('Acción denegada: Un Administrador principal no puede darse de baja a sí mismo.', 'error');
      return;
    }

    this.uiService.mostrarToast(
      `El backend no dispone de DELETE /api/admin/empleados/${usr.id}. Pídeselo a tu compañero para activar la baja real de ${usr.nombre}.`, 
      'warning'
    );
  }
}
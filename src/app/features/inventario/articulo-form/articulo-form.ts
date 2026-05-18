import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-articulo-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './articulo-form.html',
  styleUrl: './articulo-form.scss'
})
export class ArticuloFormComponent {
  private fb = inject(FormBuilder);
  private articuloService = inject(ArticuloService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isEditMode = signal(false);
  articuloId = signal<number | null>(null);

  // Definición del formulario
  articuloForm = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    precio: [0, [Validators.required, Validators.min(0.01)]],
    tipo: ['PRODUCTO' as 'PRODUCTO' | 'SERVICIO', Validators.required],
    stock: [0, [Validators.required, Validators.min(0)]],
    stockMinimo: [0, [Validators.required, Validators.min(0)]],
    descripcion: ['']
  });

  constructor() {
    // Comprobamos si estamos en modo edición o creación
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.articuloId.set(Number(id));
      this.cargarArticulo(Number(id));
    }
  }

  cargarArticulo(id: number) {
    this.articuloService.getArticuloById(id).subscribe(art => {
      // Ajuste por si el backend te devuelve 'precioBase' en lugar de 'precio'
      const precioPVP = art.precio || (art.precioBase * (1 + (art.porcentajeIva || 21) / 100));
      
      this.articuloForm.patchValue({
        nombre: art.nombre,
        precio: Number(precioPVP.toFixed(2)),
        tipo: art.tipo || 'PRODUCTO',
        stock: art.stock || 0,
        stockMinimo: art.stockMinimo || 0,
        descripcion: art.descripcion || ''
      });
    });
  }

  guardar() {
    if (this.articuloForm.invalid) return;

    const formVal = this.articuloForm.getRawValue();

    // Construimos el objeto EXACTO que pide el backend
    const articuloData: any = {
      nombre: formVal.nombre, // El backend espera 'nombre', no 'nombreArticulo'
      tipo: formVal.tipo, // El backend espera 'tipo' como string, no como enum
      stock: formVal.stock, // El backend espera 'stock', no 'stockActual'
      stockMinimo: formVal.stockMinimo, // El backend espera 'stockMinimo', no 'stockMinimo'
      porcentajeIva: 21, // Valor por defecto para España, por ejemplo
      precio: formVal.precio, // El precio que el usuario introduce es el PVP, el backend lo usará para calcular la base
      precioBase: Number((formVal.precio / 1.21).toFixed(2)), // Calculamos la base
      activo: true
    // El empresaId lo debería sacar el backend del Token, 
    // pero si sigue fallando, lo añadiremos aquí.
  };

    if (this.isEditMode()) {
      this.articuloService.actualizarArticulo(this.articuloId()!, articuloData).subscribe({
        next: () => this.router.navigate(['/inventario']),
        error: (err) => alert('Error al actualizar: ' + (err.error || err.message))
      });
    } else {
      this.articuloService.crearArticulo(articuloData).subscribe({
        next: () => this.router.navigate(['/inventario']),
        error: (err) => alert('Error al crear: ' + (err.error || err.message))
      });
    }
  }
}
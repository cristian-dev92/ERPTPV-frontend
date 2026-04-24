import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Articulo } from '../../../core/models/articulo.model';
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
    descripcion: ['']
  });

  constructor() {
    // Si la URL tiene un ID, estamos editando
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEditMode.set(true);
      this.articuloId.set(Number(id));
      this.cargarArticulo(Number(id));
    }
  }

  cargarArticulo(id: number) {
    this.articuloService.getArticuloById(id).subscribe(art => {
      this.articuloForm.patchValue(art);
    });
  }

  guardar() {
    if (this.articuloForm.invalid) return;

    const articuloData: Articulo = this.articuloForm.getRawValue();

    if (this.isEditMode()) {
      this.articuloService.actualizarArticulo(this.articuloId()!, articuloData).subscribe(() => {
        this.router.navigate(['/inventario']);
      });
    } else {
      this.articuloService.crearArticulo(articuloData).subscribe(() => {
        this.router.navigate(['/inventario']);
      });
    }
  }
}
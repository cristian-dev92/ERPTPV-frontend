# Estado del proyecto ERPTPV-frontend (Jul 2026)

## Reglas
- **No tocar el backend**. Si se necesita algún cambio en Java, se avisa al compañero y se anota en "Backend — Tareas para el compañero". Nunca modificar archivos `.java` ni ejecutar Maven.

## Resumen
- **Modal ticket**: Layout de 2 columnas (grid 1.5fr 1fr). Columna izquierda (`.left-column`): info cliente + contenido del ticket + totales. Columna derecha (`.actions-section`): acciones operativas. Submodal de configuración dentro de `.left-column`.
- **orden-list.html**: Códigos de etiqueta (🔖 #260001) en cada línea y resumen en card. Sin "notas generales". "Detalles por trabajo" unificado con "contenido del ticket". Fecha de recogida desde `orden.trabajosTaller?.[0]?.fechaPrometidaRecogida`. Modal balanceado sin divs extra.
- **orden-list.ts**: Métodos `codigosEtiqueta()`, `convertirFechaISO()` (soporta `dd-MM-yyyy` e ISO). `verDetalle()` usa `convertirFechaISO()`.
- **tpv.ts/tpv.html**: Validaciones precio cero, sincronización fecha recogida/entrega, fix `$index` shadowing con `@let lineaIdx`, validación cliente con `tieneServicioEnCarrito()`.
- **Backend**: `TrabajoTallerDTO.java` con `@JsonFormat(pattern = "yyyy-MM-dd")`. Recompilado con `mvn clean compile`. Ya no hay error 400 al seleccionar fecha.

## Backend — Tareas para el compañero
1. **Añadir `articuloBaseId` a `TrabajoTallerSalidaDTO.java`**
   - Campo: `private Long articuloBaseId;`
   - En el constructor: `this.articuloBaseId = trabajo.getArticuloBase() != null ? trabajo.getArticuloBase().getId() : null;`
   - Motivo: necesario para que el frontend pueda incluir servicios de taller (que consumen material) en las devoluciones, mandando `articuloBaseId` como `articuloId` en `DevolucionRequest.LineaDevolucion`.

2. **Actualizar `estadoPago` de la orden original al procesar devolución**
   - En `OrdenServiceImpl.procesarDevolucion()`, cuando `peticion.ordenOrigenId != null`, actualizar `ordenOriginal.setEstadoPago(EstadoPago.DEVUELTO)` y guardarla.
   - Motivo: el frontend consulta `orden.estadoPago` para saber si el botón "Solicitar Devolución" debe mostrarse. Si el backend no lo actualiza, el botón sigue visible aunque ya se haya devuelto.

3. **Añadir `direccion` a `ProveedorDTO.java`**
   - Campo: `private String direccion;`
   - En el constructor: `this.direccion = proveedor.getDireccion();`
   - Motivo: el frontend muestra el campo "Dirección Postal / Almacén" en el formulario de proveedores, pero el DTO de respuesta no lo incluye, por lo que al editar un proveedor la dirección aparece siempre vacía.

## Pendiente / Bloqueado
- (ninguno)

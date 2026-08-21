# PLAN-REDISENO — ANMA Regalos

Rediseño de la carga de pedidos: de generador de presupuestos externo a registro interno + herramienta de análisis por cliente.

**Estado: Fase 1 arrancada.** Fase 0 aprobada por Ana el 2026-08-21 con 5 decisiones consolidadas en §10.

---

## 1. Contexto

La app se construyó como generador de presupuestos para enviar al cliente final. El negocio no lo usa así: trabaja a pedido para empresas, sin stock físico, cargando datos desde el celular y desde Excel. El nuevo eje es velocidad de carga + análisis por cliente, no salida presentable hacia afuera.

**Fuera de este rediseño (contrato intocable):**
- `Mensajes.jsx` (WhatsApp/recontactos)
- Auth, sesión, `allowed_sites`, aislamiento de workspaces
- `lib/sync.js` (mecanismo de sync — se pueden sumar claves, no reescribir)
- MercadoPago / cobros existentes

---

## 2. Mapeo del estado actual

### 2.1 Rutas afectadas (de `AppShell.jsx`)

| Ruta | Componente | Rol en el rediseño |
|---|---|---|
| `/` | `Historial` | Lista de pedidos — reescribir vista, mantener campos contrato |
| `/presupuesto` y `/presupuesto/:id` | `Presupuesto` | **Reescribir completo.** Es el corazón del cambio |
| `/catalogo` | `Catalogo` | Se conserva; deja de ser puerta de entrada |
| `/clientes` | `Clientes` | Sin cambios |
| `/insumos` | `Insumos` | **Congelar** — sacar de la nav en Fase 3, página viva por si hace falta rescatar datos. Fusión Catálogo+Insumos+Packaging queda para ciclo separado (ver §7 Fase 5) |
| `/logistica` | `Logistica` | Sin cambios (viajeId y logisticaParadas del budget se preservan) |
| `/mensajes` | `Mensajes` | **NO TOCAR** |
| Resto (`/proveedores`, `/config`, `/mi-cuenta`, `/guia`, `/admin`, `/importador`) | — | Sin cambios |

### 2.2 Módulos técnicos

| Archivo | Líneas | Rol |
|---|---:|---|
| `src/components/pages/Presupuesto.jsx` | 3843 | Wizard 4 pasos + kit/simple mode + cálculo margen/IVA/discount + generación PDF HTML + share WA |
| `src/components/pages/Historial.jsx` | 2298 | Lista + bulk actions + change status + trigger stock deduct/restore + share WA |
| `src/components/pages/Catalogo.jsx` | 2589 | CRUD catálogo productos |
| `src/components/pages/Insumos.jsx` | 815 | CRUD insumos + KPIs inventario (queda congelado — no se toca) |
| `src/components/pages/Mensajes.jsx` | 581 | Templates WA — lee de `budgets` |
| `src/context/DataContext.jsx` | 375 | `saveBudget`, `deleteBudget` (con lógica stock), `updateBudgetStatus`, `deductKitStock`, `restoreKitStock` |
| `src/lib/storage.js` | 144 | localStorage layer + `STATUS_MAP` + `PAY_STATUS_MAP` + defaults |
| `src/lib/sync.js` | 237 | Sync blob → `anma_user_data`. `DATA_KEYS` incluye `budgets`, `insumos`, `stockMoves`, `waTemplates` |
| `src/lib/pedido.js` | **nuevo (Fase 1)** | Adaptador bidireccional pedido↔budget + cálculo de totales |

### 2.3 Modelo de datos actual del budget

Objeto en `localStorage['anma3_u_<uid>_budgets']` (array), sincronizado como blob a `anma_user_data.data.budgets`. **Fuente de verdad**. Las tablas normalizadas (`regalos_budgets`) existen pero no se usan.

```
budget {
  id, num, date, updatedAt,
  status,        // draft|sent|confirmed|inprogress|delivered|cancelled + legacy: negotiating, lost
  payStatus,     // pending|partial|paid

  // Cliente denormalizado
  contact, company, wa, clientEmail, ocasion,

  // Entrega
  delivery, deliveryDate, shipCost, shipCharged, envioACotizar,

  // Precios
  margin, deposit, discount, logoCost,
  total, totalFinal, totalCost, totalGain, depositAmt,

  // Logística (opcional, se preserva sin cambios)
  viajeId, logisticaParadas[], comisionista, viajeFecha,
  logisticaCharged, logisticaShowDetail,

  // Notas
  noteInt, noteCli,

  // Contenido — dos modos
  alternatives: [{
    id, label, approved,
    kits: [{
      id, name, qty, priceUnit, costUnit,
      packaging: [{ id, name, qty, costUnit }],
      products:  [{ id, name, qty, costUnit }],
      personalizacion: { desc, costUnit, designCost, laborCost, printCost }
    }]
  }],
  approvedAltId,

  simplePack: [{ id, name, qty, costUnit }],
  simplePers: { desc, costUnit, designCost, laborCost, printCost },
  items: [...],  // proyección legacy — Mensajes.jsx la lee

  stockDeducted: bool,
  payments: [{ amount, ... }],
}
```

### 2.4 Contratos con módulos que NO se tocan

**`Mensajes.jsx` consume del budget:**
- `budget.contact`, `budget.company` → matching de cliente
- `budget.total` → `{{precio}}`
- `budget.items[].name` → `{{producto}}` (usa `items`, no `alternatives`)
- `budget.deliveryDate` o `budget.date` → `{{fecha}}`
- `budget.id` → ordenamiento

**Implicancia P0:** el adaptador `budgetFromPedido()` proyecta `items[]` desde `lineas[]` con la forma que Mensajes espera.

**`Logistica.jsx` consume del budget:**
- `budget.viajeId`, `budget.logisticaParadas`, `budget.comisionista`, `budget.viajeFecha`
- Se preservan sin cambios en el pedido nuevo (bloque "Logística" existe pero es passthrough)

**`sync.js` DATA_KEYS:** `insumos` y `stockMoves` siguen viajando (decisión Ana §10). No se tocan.

---

## 3. Candidatos a eliminación — Stock / Inventario

Todo esto sale (brief: "no hay stock de mercadería").

### 3.1 Código app

| Ubicación | Qué es |
|---|---|
| `DataContext.jsx:125-155` | Rama de `deleteBudget` que restaura stock si `stockDeducted` |
| `DataContext.jsx:252-303` | `restoreKitStock()` |
| `DataContext.jsx:305-361` | `deductKitStock()` |
| `Historial.jsx:614` | Import `deductKitStock, restoreKitStock` |
| `Historial.jsx:981-1009` | Lógica de deduct/restore en cambio de payStatus/status |
| `Historial.jsx:1029-1032` | Restore stock al marcar como perdido |
| `Historial.jsx:1061-1072` | Bulk deduct/restore en cambio masivo de estado |
| `Historial.jsx:1097` | Columna "Stock descontado Sí/No" |
| `Presupuesto.jsx:342, 448, 1025-1047, 1111, 2490-2501` | Import + call sites + UI de stock |
| `Presupuesto.jsx:2257, 2277, 2592, 2615, 2870-2872` | Pickers de insumos dentro del kit |

### 3.2 Página

- **`Insumos.jsx` NO se elimina.** Congelar: sacar de nav en Fase 3, código vivo. Fusión con Catálogo en ciclo separado.
- Ruta `/insumos` en `AppShell.jsx:339` — se mantiene (accesible por URL directa, invisible en nav)
- Item "Packaging" del BottomSheet en `AppShell.jsx:368` — eliminar

### 3.3 Storage / Sync

- **Sync intocado.** `insumos` y `stockMoves` siguen en `DATA_KEYS` (decisión Ana §10).
- Fields en budget que se dejan de escribir en el pedido nuevo: `stockDeducted`
- Fields en budget legacy que ya no se calculan/persisten: `totalCost`, `totalGain` (se derivan on-the-fly en Historial)
- Fields en `products` y `insumos`: `stock`, `lastMove` — se preservan (Insumos congelado los sigue usando)

---

## 4. Candidatos a archivo — Presentación externa

Ana confirmó: sin PDF, sin share pulido hacia el cliente.

| Ubicación | Qué es | Acción |
|---|---|---|
| `Presupuesto.jsx:1350-1670+` | Generación PDF HTML (print CSS, IVA/deposit/discount rendering) | Eliminar en Fase 3 |
| `Presupuesto.jsx:1317, 1326, 1335` | Share WA con `waText`, `fullText`, `buildBankInfoText` | Eliminar |
| `Presupuesto.jsx` `previewHtml` state y modal | Preview del PDF | Eliminar |
| `Historial.jsx:462-472, 1195, 1458, 1837` | Botones "Enviar por WhatsApp" con mensaje pre-formateado | Preservar el link a WA del cliente (registro útil); sacar el texto pre-formateado |
| `storage.js:59-64` | `paymentConditions`, `legalNote`, `validity`, `deliveryModes` en defaults | Marcar legacy; no se usan en el nuevo flujo |
| Bienvenida / Guía | Copy "generá presupuestos profesionales" | Reescribir en Fase 3 |

Mensajes.jsx cubre 100% del contacto por WhatsApp con templates propios. Cero pérdida funcional.

---

## 5. Modelo de datos objetivo

```
pedido {
  id, numero, createdAt, updatedAt,

  clienteId,           // opcional
  clienteNombre,       // denormalizado

  estado,              // consulta | presupuestado | pausado | confirmado |
                       //   produccion | entregado | cerrado | perdido
  incompleto,          // bool — true cuando vino de carga rápida

  esKit,               // bool
  cantKits,            // int, solo si esKit

  lineas: [{
    id,
    descripcion,       // texto libre — único obligatorio
    tag,               // producto | packaging | manoDeObra | diseno | envio | otro
    cantidad, costoUnit, precioUnit,
    esCostoUnico,      // bool — true = no se multiplica
    productoId?,       // opcional, si vino del catálogo
    proveedorId?,
    estadoCompra,      // pendiente | pedido | recibido  (reemplaza al stock)
  }],

  precioFinalManual?,  // si se escribió un número redondo, este manda
  aplicaIva,           // default false

  fechaEntrega?,
  seniaMonto?,         // en pesos, no porcentaje

  notaInterna,         // texto libre, largo

  alternativas?: [{ id, label, aprobada, lineas: [...] }],
  alternativaAprobadaId?,

  // Passthrough para Logística (no se muestran en el bloque principal)
  viajeId?, logisticaParadas?, comisionista?, viajeFecha?,
  logisticaCharged?,
}
```

**Sale del modelo:** `stockDeducted`, `totalCost`, `totalGain` (on-the-fly), `depositAmt` (se calcula de `seniaMonto`), `envioACotizar`, `logoCost` (pasa a `linea.tag='diseno'`), `simplePack`/`simplePers` (reemplazados por `lineas`).

**Se preservan como proyección al persistir** (contrato Mensajes + Logística): `contact`, `company`, `total`, `items[].name`, `date`, `deliveryDate`, `viajeId`, `logisticaParadas`, `comisionista`, `viajeFecha`.

---

## 6. Estados — 8 en total

| Estado nuevo | Cuándo aplica | Mapea a `budget.status` legacy |
|---|---|---|
| `consulta` | Estado inicial. Solo se sabe quién y qué quiere | `draft` |
| `presupuestado` | Ya se le mandó un precio (aunque informal) | `sent` |
| `pausado` | Cliente pidió esperar o hay una traba | `sent` + flag `estado` |
| `confirmado` | Cliente aceptó, aún no arrancó producción | `confirmed` |
| `produccion` | En preparación | `inprogress` |
| `entregado` | Entregado | `delivered` |
| `cerrado` | Cerrado sin venta, neutro (no se dio) | `cancelled` |
| `perdido` | Cliente rechazó explícito o eligió otra opción | `cancelled` + flag `estado` |

**Doble persistencia:** al escribir se pobla tanto `status` (legacy, para compat con Mensajes/Historial viejo) como `estado` (nuevo). Al leer, si existe `estado` se usa; si no, se mapea desde `status`. Así los pedidos existentes se leen con el enum nuevo sin migración destructiva.

Estados legacy que colapsan al leer:
- `negotiating` → `presupuestado`
- `lost` → `perdido`

---

## 7. Plan por fases

Cada fase termina con app funcionando en producción.

### Fase 0 — Auditoría ✅
- Entregable: este documento
- **Aprobada 2026-08-21**

### Fase 1 — Adaptador (backend-only) 🚧
- `src/lib/pedido.js` con:
  - `pedidoFromBudget(budget)` — reconstruye pedido desde budget legacy
  - `budgetFromPedido(pedido)` — proyecta pedido → budget preservando contrato Mensajes/Logística
  - Mapeos de estado bidireccionales
  - `calcularTotales(pedido)` — subtotal, IVA, total, margen, ganancia
- No cambia UI. La app funciona igual.
- Riesgo: cero visible al usuario.

### Fase 2 — Nueva carga de pedido (`/pedido` en paralelo)
- `PedidoNuevo.jsx` — vista única scrolleable (§8)
- Ruta nueva `/pedido` y `/pedido/:id` **en paralelo** a `/presupuesto`
- Historial gana toggle "abrir con UI nueva" — Ana prueba, si algo no está, vuelve al viejo
- Se ejercita en producción sin romper el flujo actual
- **Fin de fase: Ana confirma que el nuevo flujo cubre lo que necesita**

### Fase 3 — Corte + cleanup
- Redirigir `/presupuesto` → `/pedido`
- Sacar `Insumos` de nav (item BottomSheet), ruta se preserva
- Sacar `deductKitStock`/`restoreKitStock` de `DataContext.jsx`
- Sacar toda la lógica de stock de `Historial.jsx` (bulk, columna, imports)
- Sacar PDF y shares embebidos de `Presupuesto.jsx` (o borrar el archivo si `PedidoNuevo` lo reemplaza total)
- Reescribir copy de Bienvenida/Guía

### Fase 4 — Post-limpieza (opcional)
- Eliminar `paymentConditions`, `legalNote`, `validity`, `deliveryModes` de defaults
- Documentar en changelog qué fields quedan legacy en budgets antiguos

### Fase 5 — Fusión Catálogo + Insumos + Packaging (ciclo separado)
- Fuera de scope de este rediseño
- Propuesta: módulo unificado "Materiales" con toggle producto/insumo/packaging
- Requiere su propio PLAN

---

## 8. Vista única `PedidoNuevo` — sección 5.1+

Layout scrolleable, sin steps, sin numeración. Menú "⋯" para opciones avanzadas.

```
┌─ Nuevo pedido / Editar #ANM-0042 ─────────────────────┐
│  [autoguardado ✓]                          [ ⋯ menú ] │
├───────────────────────────────────────────────────────┤
│                                                       │
│  CLIENTE                                              │
│  ┌──────────────────────────┐  Ocasión (opc)          │
│  │ Empresa / persona        │  [_____________]        │
│  └──────────────────────────┘                         │
│                                                       │
│  LÍNEAS                                       [+ Fila]│
│  ┌─────────────────────────────────────────────────┐  │
│  │ Descripción      Cant  Costo/u  Precio/u  Estado│  │
│  │ Box mate premium  50    1.200    2.400  [pedido▾]│ │
│  │ Cajas kraft       50      200      —    [pendiente]│
│  │ Diseño logo        1  [único✓]  8.000       —    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  PRECIO                                               │
│  Subtotal            180.000                          │
│  IVA 21% [◯ off]           0                          │
│  ┌──────────────────────┐                             │
│  │ TOTAL     [180.000]  │  editable → recalcula margen│
│  └──────────────────────┘                             │
│  Margen 33%  ·  Ganancia 60.000                       │
│  Seña [50%] = 90.000                                  │
│                                                       │
│  ENTREGA                                              │
│  Fecha [__/__/____]                                   │
│                                                       │
│  NOTA INTERNA                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Texto libre, largo, sin estructura              │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
└───────────────────────────────────────────────────────┘

Menú "⋯":
  • Estado [consulta ▾]
  • Alternativas (0)
  • Kit mode (agrupar como box × cantKits)
  • Duplicar pedido
  • Eliminar pedido
```

**Reglas:**
- Autosave en cada blur/paste/tecla (debounce 500ms). Sin "Siguiente" ni "Guardar".
- Guardable con Cliente + 1 línea con descripción. Nada más bloquea.
- Precio ↔ margen bidireccional: editás uno, el otro se recalcula.
- Estado default `consulta`. Se cambia desde "⋯", no bloquea el guardado.
- Chip `estadoCompra` por línea reemplaza el flujo de stock.
- Kit mode = agrupar todas las líneas como componentes de un box × cantidad. Toggle en menú.
- Alternativas viven en el menú. 0 por default. Si sumás una, aparece un selector arriba de LÍNEAS.
- Mobile: mismo layout, líneas se convierten en cards apiladas.

**Anti-patrones evitados:**
- Sin modales para agregar línea (inline)
- Sin confirmación al abandonar (autosave garantiza persistencia)
- Sin asteriscos rojos — líneas vacías grises hasta escribir
- Sin tabs, sin acordeones obligatorios

---

## 9. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Mensajes.jsx deja de resolver variables porque el nuevo modelo no expone `items[].name` | `budgetFromPedido()` proyecta `items[]` desde `lineas[]`. Test manual con Mensajes al final de Fase 1 |
| R2 | Ana tiene pedidos con `stockDeducted:true`. Al no revertir, insumos quedan con conteo colgado | Insumos queda congelado, invisible en nav. Conteo colgado no se ve. Documentar en changelog |
| R3 | Historial.jsx bulk actions asumen `stockDeducted` en cada transición | Fase 3: revisar todos los call-sites en Historial. Test manual de bulk change status |
| R4 | Alternativas: 90% pedidos usan una sola, pero el 10% no puede perder acceso | Menú "⋯" → "Alternativas (N)" en Fase 2. Modelo interno las preserva |
| R5 | Pedidos viejos con `alternatives` extensas → el adaptador tiene que colapsar a `lineas` sin perder la aprobada | `pedidoFromBudget()` toma `alternatives[approvedAltIdx].kits` como fuente principal; resto en `pedido.alternativas` |
| R6 | Autosave sin `Siguiente` puede pisar datos si Ana carga desde dos pestañas | Sync ya hace last-write-wins por `updatedAt`. Cada cambio bumpea `updatedAt` |
| R7 | Presupuesto.jsx tiene 3843 líneas — reescribir en un commit es ingobernable | Fase 2 arranca de cero con `PedidoNuevo.jsx`. Presupuesto.jsx queda intacto durante Fase 2 |
| R8 | Legacy `items[]` en algunos budgets sin `alternatives` | `pedidoFromBudget()` reconstruye desde `items` si `alternatives` está vacío |
| R9 | Estados nuevos (`pausado`, `perdido`) al persistir a Supabase tabla normalizada podrían violar check constraint | Storage autoritativo es blob JSON. Tabla normalizada no se usa hoy. Si algún día se migra, agregar los estados al check |

---

## 10. Decisiones consolidadas (Ana, 2026-08-21)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Pedidos viejos → UI nuevo desde arranque | Sí. Adaptador de lectura hace el trabajo |
| 2 | Insumos.jsx | Congelar (no borrar, no rediseñar). Fusión con Catálogo en ciclo separado (Fase 5) |
| 3 | Estados a sumar | Solo `pausado`. Total 8. `en_recontacto` y `revisar` se descartan |
| 4 | `totalCost` / `totalGain` | Eliminar del modelo persistido. On-the-fly desde `lineas` |
| 5 | Sync — `insumos` / `stockMoves` | NO tocar. Siguen viajando, aunque UI no los muestre |
| 6 | Vista única (§8) | Aprobada |

---

**Firmado por:** Fase 0 auditor.
**Fecha aprobación:** 2026-08-21.
**En curso:** Fase 1 — `src/lib/pedido.js`.

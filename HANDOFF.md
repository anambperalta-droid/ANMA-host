# HANDOFF — Proyecto ANMA (Hub + Regalos)

> Documento de traspaso COMPLETO para retomar el proyecto en un chat nuevo, sin re-descubrir nada.
> Última actualización: **23/06/2026**.

---

## 0. Resumen en 30 segundos

**ANMA** son **dos apps SaaS de gestión** para comercios argentinos, casi gemelas en código:
- **ANMA Hub** (antes "ANMA Pro") — producto general de gestión. Es donde se trabaja más.
- **ANMA Regalos** — el mismo producto adaptado al nicho de regalos/obsequios (invite-only).

Ambas comparten **el mismo proyecto Supabase**, los mismos patrones y casi los mismos archivos. Stack: React 19 + Vite (MPA) + Supabase + Vercel + MercadoPago + PWA.

---

## 1. Las dos apps — rutas, repos, dominios

| | **ANMA Hub** | **ANMA Regalos** |
|---|---|---|
| Nombre viejo | ANMA Pro | — |
| Local | `C:\Users\anamb\Downloads\ANMA\anma-app` | `C:\Users\anamb\Downloads\ANMA\anma-regalos` |
| Repo GitHub | `anambperalta-droid/ANMA` | `anambperalta-droid/ANMA-host` |
| Producción | **anmahub.com** | **anma-host.vercel.app** |
| localStorage prefix | `anma4_` | `anma3_` (verificar) |
| Nicho | gestión general | regalos/obsequios, invite-only |

- **Supabase compartido:** proyecto `paxsvjdimqlfxnlipplx` (auth + datos + RLS de las DOS apps).
- **Clarity (heatmaps):** tag `x6m6t83r6u`.
- Regalos **espeja** a Hub: cuando se hace un cambio estructural en Hub, casi siempre hay que replicarlo en Regalos (con diferencias de texto/nicho).

## 2. Arquitectura

### MPA (multi-page) con Vite
- `index.html` = **landing** pública (en `/`).
- `app/index.html` = **SPA React** (en `/app`, `react-router-dom v7` con `BrowserRouter basename="/app"`).
- `public/recursos/` = blog/SEO (índice + 9 artículos + `article.css`).
- Migración hecha (jun 2026): antes el login estaba en `/`; ahora `/` = landing, `/app` = la app. Hay **redirects 308** de rutas viejas (`/login`→`/app/login`, etc.) en `vercel.json`.

### Data layer (offline-first + sync)
- **localStorage** es la fuente offline-first. Helpers user-scoped (`db()/dbW()`, prefijos `anma4_`/`anma3_`, aislamiento por `userId`). `src/lib/storage.js` tiene `setStorageUser()` y `fmt()` (formateador de moneda configurable es-AR/en-US).
- **Supabase sync:** blob JSONB `anma_user_data` (user_id es TEXT, no uuid) + **esquema relacional normalizado** (aplicado 2026-05-23): tablas `business_profiles`, `pro_clients`, `pro_suppliers`, `pro_products`, `pro_insumos`, `pro_stock_moves`, `pro_budgets`, `regalos_clients`, `regalos_products`, `regalos_budgets`, `regalos_assignments` — todas con `workspace_id → workspaces(id) ON DELETE CASCADE`.
- Migraciones en `anma-app/supabase/migrations/`.

### Auth + permisos (Supabase)
- Supabase Auth (email/password, Google OAuth, reset password, magic link). `AuthContext.jsx` llama `setStorageUser(userId)` en login/logout.
- **RLS** vía helpers SQL: `my_workspace_ids()`, `is_global_admin()`, `my_role()`. 16 tablas con RLS ON.
- **Admin global:** ana.mbperalta@gmail.com.
- Roles/permisos por workspace; tab "Equipo" solo para admin.

### Serverless `/api/` (Hub)
- `mp-create-preference.js` — crea preferencia de pago MP (token server-side).
- `mp-webhook.js` — recibe notificaciones de MP.
- `mark-paid.js` — marca pago manual (admin-only).
- `mp-proxy.js` — proxy a 2 endpoints fijos de MP (evita CORS del navegador).
- `cron-daily.js` — tarea diaria.
- `_cors.js` — **helper de CORS con allowlist** (creado 23/06).

### Pagos (MercadoPago CheckoutPro)
- `MP_ACCESS_TOKEN` solo en env vars de Vercel (All Environments — ojo: si está solo en Development falla; requiere redeploy al cambiar).
- back_urls apuntan a `/app/pago-exitoso|pendiente|error`.

### PWA
- manifest + Service Worker (network-first + stale-while-revalidate). Bumpear `CACHE_VER` al cambiar (Hub iba en `anma-pro-v6`, Regalos `anma-regalos-v5`).
- Botón "Instalar app" en Login + Sidebar (`lib/pwaInstall.js` + `InstallButton.jsx`).

## 3. Páginas de la app (Hub, `src/components/pages/`)

`Historial` (dashboard principal), `Catalogo` (productos + stock por variante), `Clientes`, `Presupuesto` (wizard de pedidos), `Proveedores`, `Insumos`, `Logistica`, `Mensajes`, `Config`, `Importador`, `MiCuenta`, `Admin` (+`admin/`), `PortalProveedor` (vista pública read-only por link), `Onboarding`, `Bienvenida`, `Registro`, `Login`, `Activar`, `Alta`, `PagoResultado`, `TrialExpirado`, `NotFound`. Regalos tiene el set equivalente.

## 4. Sistema de diseño (definido y aplicado)

| Uso | Fuente | Detalle |
|-----|--------|---------|
| Títulos display (h1/h2/h3 landing y artículos) | **Fraunces** serif | weight 600, editorial |
| Wordmark "ANMA Hub" (nav/logo/Login/Sidebar) | **Poppins** | weight 600, letter-spacing .2px |
| Cuerpo / UI | **Inter** | 400–700 |

- **Violeta institucional: `#7C3AED`** (un solo tono; los degradados del hero usan tints).
- ❌ **Nunca Inter weight 900** para títulos/wordmark (Ana: "tosco, rígido").
- ❌ **Nunca íconos multicolor** en features/tarjetas del landing (Ana: "colorinche"). Íconos unificados en violeta.
- **Viudas:** `text-wrap:balance` en títulos, `text-wrap:pretty` en párrafos/listas (responsive-safe; no `white-space:nowrap` fijo).
- **Logo real:** render 3D (`public/logoanma.jpeg`, la "A" de cinta violeta). NO dibujarlo a mano en SVG (sale feo). Se procesó con Pillow (keying por saturación) → `favicon-a.png`, `favicon-32/48.png`, `icon-192/512.png`, etc.

## 5. Reglas de trabajo (IMPORTANTE)

- **NO cambiar la estética de la app interna (`/app`)** — a Ana le gusta como está. Los rediseños son **solo landing + recursos**.
- **Sin emojis** en ningún lado (templates, portal, copy).
- **Voz de marca:** cálida, no agresiva. Español argentino (vos/tenés).
- **Secretos** (MP_ACCESS_TOKEN, service_role) **solo server-side** en `/api/` + env vars. Nunca en cliente. `.env` nunca commiteado.
- **Diseño:** no debe parecer "plantilla hecha con IA".

## 6. Cómo deployar

```bash
cd "C:\Users\anamb\Downloads\ANMA\anma-app"   # o anma-regalos
npm run build           # valida
git add <archivos>
git commit -m "..."     # firmar con Co-Authored-By
git push origin main    # Vercel auto-deploya
```
- Hard-refresh (`Ctrl+Shift+R`) para ver cambios (fuentes/CSS cachean).
- `public/` se copia tal cual. Vercel `cleanUrls:true` → `.html` hace 308 a la URL sin extensión.

## 7. Historia del producto (qué ya se construyó)

- **Aislamiento de datos por usuario** en localStorage (prefijos + userId).
- **Dashboard (Historial):** 4 tabs (Resumen/Lista/Análisis/Seguimiento), KPIs con delta vs mes anterior, gráficos, donut de estados, top clientes, seguimiento agrupado por urgencia, multi-select + cambio masivo de estado + export CSV, insights con guardas de muestra mínima.
- **Formato de moneda configurable** (es-AR / en-US).
- **Esquema relacional normalizado** + migración de datos desde el blob JSONB (no destructiva).
- **Migración de routing** a landing `/` + app `/app` con redirects 308 y backward-compat.
- **Auth verificado en vivo:** reset password, Google login, registro.
- **Seguridad (jun 2026):** CSP + HSTS + Permissions-Policy + Referrer-Policy; RLS ON en 16 tablas; webhook MP no falsificable; mark-paid admin-only.
- **SEO:** 9 artículos en `/recursos` con schema.org (Article + FAQPage), sitemap, robots, títulos optimizados.
- **Logo real** aplicado en favicon/PWA/landing/login (procesado con Pillow).
- **Stock por variante** (talle/color) con alerta de stock mínimo independiente por variante, end-to-end (Catalogo, Presupuesto, DataContext, Historial, NotificationBell, Proveedores). Helper `src/lib/stock.js`. (En Hub; en Regalos pendiente decidir.)
- **MercadoPago** operativo (token server-side; back_urls a `/app`).
- **Short-link de portal de proveedor** vía RPC Supabase (`get_portal_link`, tabla `portal_links`).
- **PWA install** prominente + selección masiva en móvil + recontacto masivo por WhatsApp (ambas apps).
- **Templates de email** rediseñados sin emojis (6 templates, pegados en Supabase por Ana).

## 8. Sesión 23/06/2026 (diseño landing + recursos del Hub — todo deployado)

1. Wordmark **Poppins** (landing + recursos + app Login/Sidebar).
2. Títulos **Fraunces** en el landing.
3. **CORS restringido al dominio** en Hub → `api/_cors.js` en `mp-create-preference`, `mark-paid`, `mp-proxy` (antes `*`).
4. URLs limpias de recursos (sin `.html`) en canonical/og/sitemap/links.
5. CTAs de cierre contextuales por artículo.
6. Landing: títulos +4px, paddings compactos, fondos violeta glow (radiales), gradiente h1 violeta→rosa, números 01/02/03 violeta.
7. Landing: íconos de features y rubros **unificados a violeta**; paneles de rubro a tinte violeta uniforme.
8. Recursos: viudas (`text-wrap`), avatar AH violeta vibrante, medida 748px, barra lateral h2 refinada, acento gradiente bajo h1, **nav con "← Recursos"**, números de listas en negro.

## 9. Pendientes

### 🔔 Recordar a Ana / retomar primero
- **CORS en ANMA Regalos** — replicar `api/_cors.js` (allowlist en vez de `*`) en sus funciones de pago. En Hub ya está.

### Código (opcional)
- **Inconsistencia recursos:** los 5 artículos VIEJOS tienen `.author` ANTES del `<h1>` (meta→author→h1→lead); los 4 nuevos lo tienen después (meta→h1→author→lead). Unificar a meta→h1→author→lead en: `control-de-stock-tienda-de-ropa`, `excel-vs-sistema-de-gestion`, `gestion-almacen-distribuidora`, `gestion-local-decoracion`, `stock-tecnologia-electronica`.
- **Sofisticación recursos (propuesto):** pull-quotes en el texto, divisor gradiente entre secciones, mejorar tarjetas del índice.
- **Landing (propuesto):** color por categoría en los 3 pasos de "Cómo funciona"; asimetría estructural más marcada.
- **Stock por variante en Regalos** (decidir si aplica al nicho).
- **Portal de Proveedor en Regalos** — quitar emojis y alinear estética (si quedó pendiente).

### Manuales de Ana (paneles web)
- Probar **pago MercadoPago real end-to-end**.
- **Re-indexar en Google Search Console** las URLs limpias de recursos + los 4 artículos nuevos.
- Activar **Vercel Firewall** (Attack Challenge Mode + rate-limit en `/api/`) — único gap de la auditoría. Aplica a las dos apps.

## 10. Estado de seguridad

- ✅ Security headers completos en `vercel.json` (ambas apps).
- ✅ CORS restringido al dominio (Hub; **Regalos pendiente**).
- ✅ RLS ON en las 16 tablas; webhook MP no falsificable; mark-paid admin-only; secretos solo server-side.
- ⚠️ Pendiente: rate-limiting (Vercel Firewall) + CORS en Regalos.

## 11. Gotchas / notas

- El **preview local** (Claude_Preview MCP) no levanta acá: el harness corre desde una ruta de sistema, no desde el proyecto. Trabajar leyendo el código + screenshots de Ana.
- Mobile: al cambiar tamaños de título/paddings, revisar media queries (`@media(max-width:640px)` y `780px`).
- Cliente **prohibió Resend y Telegram**. No usarlos.
- Encoding: al escribir archivos con acentos vía PowerShell, usar UTF-8 sin BOM (`.NET WriteAllText`) para no corromper tildes.
- Memoria persistente del asistente (entre chats): carpeta de memoria del proyecto → `MEMORY.md`, `project_anma_pro.md`, `project_anma_regalos.md`, `project_shared_arch.md`, `project_pending_manual.md`, `feedback_typography_system.md`, `feedback_security_audit.md`.
- Handoff anterior largo: `C:\Users\anamb\Downloads\ANMA\HANDOFF_RESUMEN.md` (estado al 11/06).

---
*Generado con Claude Code. Mantener este archivo actualizado al cerrar cada sesión.*

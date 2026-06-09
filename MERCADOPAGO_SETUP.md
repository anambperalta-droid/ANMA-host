# 💳 Mercado Pago — Setup completo (15 min)

Esta guía deja el sistema de cobros funcionando end-to-end. Hacelo en este orden:

---

## 1. Migración SQL en Supabase (2 min)

1. Entrá a [supabase.com/dashboard](https://supabase.com/dashboard) → tu proyecto
2. Sidebar → **SQL Editor** → **+ New query**
3. Abrí el archivo `SUPABASE_MP_MIGRATION.sql` que está en la raíz del repo
4. Copiá todo el contenido y pegalo en el SQL Editor de Supabase
5. Click **Run** (esquina inferior derecha)
6. Deberías ver `Success. No rows returned`

**Qué hace:** agrega columnas a `workspaces` (`subscription_status`, `next_payment_due_at`, `lifetime_revenue`) + crea tabla `workspace_payments` + RLS policies + trigger automático que actualiza el estado del workspace cada vez que llega un pago.

**Verificación:**
```sql
SELECT * FROM workspace_billing_summary LIMIT 1;
```
Si devuelve cualquier cosa (incluso vacío), está OK.

---

## 2. Variables de entorno en Vercel (5 min)

### En Vercel Dashboard:
1. Entrá a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click en el proyecto **ANMA** (o **anma-host**)
3. Sidebar → **Settings** → **Environment Variables**

### Variables a agregar (todas environment "Production" y "Preview"):

| Key | Value | Descripción |
|---|---|---|
| `MP_ACCESS_TOKEN` | `TEST-881124199003012-060823-...` (el de prueba) | Para empezar. Luego cambiás al de producción cuando estés listo |
| `APP_BASE_URL` | `https://anma-host.vercel.app` | URL base de tu app |
| `SUPABASE_SERVICE_ROLE_KEY` | (copialo de Supabase) | Para que el webhook actualice DB con permisos elevados |

### Cómo conseguir `SUPABASE_SERVICE_ROLE_KEY`:
1. Supabase Dashboard → tu proyecto
2. Settings (engranaje) → **API**
3. En **Project API keys** copiá el valor de **service_role** (⚠️ NUNCA lo expongas al cliente, solo va en server-side)

### Después de pegar las variables:
- Vercel te va a pedir **Redeploy** — hacelo desde **Deployments → Latest → ⋯ → Redeploy**
- Las funciones `/api/mp-create-preference` y `/api/mp-webhook` ya van a tener acceso a las env vars

---

## 3. Webhook URL en Mercado Pago Developers (3 min)

1. Entrá a [mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers) → tu aplicación ANMA
2. Sidebar → **Webhooks** (o **Notificaciones** → **Webhooks**)
3. Click **Configurar notificaciones** o **+ Crear webhook**
4. Completá:
   - **URL de producción**: `https://anma-host.vercel.app/api/mp-webhook`
   - **URL de prueba**: `https://anma-host.vercel.app/api/mp-webhook` (la misma)
   - **Eventos a suscribir**: ✅ **Pagos** (payment)
5. Click **Guardar**
6. MP te muestra una **clave secreta** — pegala como `MP_WEBHOOK_SECRET` en Vercel (opcional pero recomendado para validar la firma del webhook)

---

## 4. Probar el flow end-to-end con cuentas de prueba (5 min)

### Crear cuentas de prueba de MP
1. En MP Developers → **Cuentas de prueba**
2. Generá **2 cuentas**:
   - **Vendedor de prueba** (es el que recibe — vos)
   - **Comprador de prueba** (es el que paga — para testear)
3. Guardá email y password de cada una

### Tarjetas de prueba (recordá: TEST tokens)
MP te da estas tarjetas que SIEMPRE funcionan en modo prueba:

| Resultado | Tarjeta | CVV | Fecha |
|---|---|---|---|
| ✅ Aprobado | 4509 9535 6623 3704 | 123 | 11/30 |
| ⏳ Pendiente | 5031 4332 1540 6351 | 123 | 11/30 |
| ❌ Rechazado | 4000 0000 0000 0002 | 123 | 11/30 |

Nombre del titular: cualquier nombre
DNI: 12345678

### Flow de prueba completo:

1. **Logueate** en tu app con un user de prueba (registrate uno fresh si querés)
2. Andá a `https://anma-host.vercel.app/activar`
3. Click **"Pagar $120.000 con Mercado Pago"**
4. Te lleva a MP — pagá con la **tarjeta aprobada** y la **cuenta de comprador de prueba**
5. MP redirige a `/pago-exitoso`
6. **En paralelo** MP llama a `/api/mp-webhook` → el trigger SQL actualiza:
   - `workspaces.subscription_status = 'pending_setup'`
   - `workspaces.activated_at = NOW()`
   - `workspaces.next_payment_due_at = NOW() + 30 días`
   - Insert en `workspace_payments` con `kind='onboarding'`, `mp_status='approved'`
7. Andá al **Admin** → el workspace aparece como `pending_setup` con `lifetime_revenue=$120.000`

### Verificar manualmente en Supabase:
```sql
SELECT id, name, subscription_status, activated_at, next_payment_due_at, lifetime_revenue
FROM workspaces
WHERE id = 'el-workspace-id-que-pago';

SELECT amount, kind, mp_status, paid_at
FROM workspace_payments
ORDER BY paid_at DESC LIMIT 5;
```

---

## 5. Cuando estés listo para producción real

### Reemplazar token de prueba por el de producción:
1. En MP Developers → **Credenciales de producción** → copiá el **Access Token** de producción (empieza con `APP_USR-`)
2. Vercel → **Settings → Environment Variables** → editá `MP_ACCESS_TOKEN` con el valor de producción
3. Redeploy
4. ¡Ya estás cobrando pagos reales!

### Tip: separar test vs prod
Si querés mantener ambos ambientes:
- Vercel permite **diferentes valores de env vars** según el branch
- Production branch (`main`) → `APP_USR-...` (producción)
- Preview branches → `TEST-...` (prueba)

---

## 🚨 Troubleshooting

### "MP_ACCESS_TOKEN no configurado"
→ La env var no se guardó o no se hizo redeploy. Hacé redeploy.

### "Workspace no encontrado"
→ El user no tiene un workspace creado todavía. Esto pasa si nunca corrió `injectSeedData`. Resolvelo con un signup limpio o creá el workspace manual en Supabase.

### El webhook nunca llega
→ Verificá la URL en MP Developers (debe ser exactamente `https://anma-host.vercel.app/api/mp-webhook`).
→ Revisá los logs de Vercel: Deployments → Latest → Functions → mp-webhook

### El pago se aprobó pero el workspace no se actualizó
→ Revisá `workspace_payments` en Supabase: ¿el registro existe?
   - Si SÍ existe pero workspace no se actualizó → revisar el trigger `on_payment_received`
   - Si NO existe → el webhook no llegó. Revisar logs de Vercel y URL en MP.

### Cómo simular un pago en development sin tener que hacer todo el flow
```bash
# Crear pago simulado directo en SQL (solo en development)
INSERT INTO workspace_payments (workspace_id, amount, kind, mp_status, paid_at)
VALUES ('<workspace-id>', 120000, 'onboarding', 'approved', NOW());

# El trigger se dispara automáticamente y actualiza el workspace
```

---

## 📊 Próximos pasos (después de Parte 1)

### Parte 2 — Sistema mensual ($30k/mes desde mes 2)
- Banner in-app que avisa al user cuando se acerca la fecha de cobro
- Vista en Admin: "Cobros pendientes este mes" con botón "Mandar link de pago"
- Acción manual "Marcar como pagado" para confirmar transferencias
- Notificación al user cuando vos confirmás pago manual

### Parte 3 — Automatización
- Cron job (Vercel Cron o Supabase Cron) que cada día revisa workspaces y actualiza `subscription_status` según `next_payment_due_at`
- Email automático al user el día -5 / -1 / +1 del vencimiento (usando Supabase Auth nativo o Edge Function)
- Pausa automática del workspace cuando pasa 7 días sin pagar

Decime cuando esté Parte 1 testeada y arrancamos Parte 2.

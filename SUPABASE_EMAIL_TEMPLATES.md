# 📧 Supabase Auth — Email Templates UNIVERSALES (Pro + Regalos)

## ⚠️ Importante: por qué un solo template para las 2 apps

ANMA Pro (`anma-hub`) y ANMA Regalos (`anma-host`) comparten el **mismo proyecto Supabase** (`paxsvjdimqlfxnlipplx`). Los email templates son **globales al proyecto** — no se pueden tener distintos por sitio.

**Solución profesional:** templates con detección automática. Cuando el user se registra:
- Desde anma-hub.vercel.app → pasamos `allowed_sites: ['hub']`
- Desde anma-host.vercel.app → pasamos `allowed_sites: ['host']`

El template usa esa variable y muestra el branding correcto. **Un solo HTML por template, ambas apps cubiertas.**

---

## ¿Cómo funciona?

Supabase manda los emails de autenticación **automáticamente** desde su SMTP cuando ocurren estos eventos:

| Trigger | Cuándo | Template a editar |
|---|---|---|
| Signup | User completa registro (si confirmación email está ON) | **Confirm signup** |
| Invitación | Admin invita a un operador desde `/admin` | **Invite user** |
| Magic link | User pide login passwordless | **Magic Link or OTP** |
| Reset password | User olvidó su contraseña | **Reset Password** |
| Cambio email | User cambia su email | **Change Email Address** |

URL directa a tu panel:
👉 `https://supabase.com/dashboard/project/paxsvjdimqlfxnlipplx/auth/templates`

---

## 📋 Variables disponibles en los templates

Supabase usa **Go templates** (mismo motor que Hugo). Variables expuestas:

- `{{ .ConfirmationURL }}` — el link de acción (siempre presente)
- `{{ .Token }}` — código OTP de 6 dígitos (alternativa al link)
- `{{ .TokenHash }}` — hash del token
- `{{ .SiteURL }}` — URL configurada en Supabase
- `{{ .Email }}` — email del destinatario
- `{{ .Data }}` — metadata custom pasada en `signUp({options: {data: {...}}})`

**Las que usamos para detectar Pro vs Regalos:**
- `{{ .Data.business_name }}` → el nombre del negocio
- `{{ .Data.allowed_sites }}` → array `["hub"]` o `["host"]`
- `{{ index .Data.allowed_sites 0 }}` → `"hub"` o `"host"` (primer elemento)

---

## ✉️ Template 1 — Confirm Signup (BIENVENIDA)

**Subject:** `🚀 ¡Bienvenido a ANMA! Activá tu cuenta`

```html
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f3f4f6">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">

        {{ if eq (index .Data.allowed_sites 0) "host" }}
        <!-- ═══ HEADER ANMA REGALOS (fucsia + violeta) ═══ -->
        <tr><td style="background:linear-gradient(135deg,#7C3AED,#D946EF);padding:40px 32px;text-align:center">
          <div style="display:inline-block;width:60px;height:60px;background:#fff;border-radius:18px;line-height:60px;margin-bottom:16px;font-size:28px">🎁</div>
          <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;letter-spacing:-.3px">¡Bienvenido a ANMA Regalos!</h1>
          <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px">7 días para descubrir cómo armás tus kits de regalo en minutos</p>
        </td></tr>
        {{ else }}
        <!-- ═══ HEADER ANMA PRO (violeta — fiel a la landing) ═══ -->
        <tr><td style="background:linear-gradient(135deg,#4C1D95,#7C3AED 50%,#A78BFA);padding:40px 32px;text-align:center">
          <div style="display:inline-block;width:60px;height:60px;background:#fff;border-radius:18px;line-height:60px;margin-bottom:16px;font-size:28px">🚀</div>
          <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;letter-spacing:-.3px">¡Bienvenido a ANMA Pro!</h1>
          <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px">7 días para descubrir cómo ANMA Pro ordena tu negocio</p>
        </td></tr>
        {{ end }}

        <!-- Body -->
        <tr><td style="padding:32px 36px">
          <p style="color:#1f2937;font-size:15px;line-height:1.7;margin:0 0 20px">
            Hola <strong>{{ .Data.business_name }}</strong>! 👋
          </p>
          <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 24px">
            Activá tu cuenta haciendo click en el botón de abajo. Te toma 5 segundos:
          </p>

          <!-- CTA con color dinámico según app -->
          <table cellpadding="0" cellspacing="0" align="center">
            <tr><td style="background:linear-gradient(135deg,{{ if eq (index .Data.allowed_sites 0) "host" }}#D946EF,#EC4899{{ else }}#059669,#10b981{{ end }});border-radius:12px;box-shadow:0 8px 24px rgba(124,58,237,.35)">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:15px;font-weight:700">
                ✓ Confirmar mi email
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:24px 0 0;text-align:center">
            O copiá este link en tu navegador:<br>
            <span style="color:#7C3AED;word-break:break-all">{{ .ConfirmationURL }}</span>
          </p>

          <!-- Tips dinámicos por app -->
          <div style="margin-top:32px;padding:20px;background:#f9fafb;border-radius:12px;border-left:3px solid #7C3AED">
            <p style="color:#1f2937;font-size:13px;font-weight:700;margin:0 0 10px">💡 Lo primero que podés hacer:</p>
            <ul style="color:#4b5563;font-size:13px;line-height:1.7;margin:0;padding-left:20px">
              {{ if eq (index .Data.allowed_sites 0) "host" }}
                <li>Armar tu primer kit en <em>Catálogo</em></li>
                <li>Cargar tu primer cliente desde <em>Clientes</em></li>
                <li>Sumar packaging desde <em>Insumos</em></li>
              {{ else }}
                <li>Cargar tu primer cliente desde <em>Clientes</em></li>
                <li>Armar tu primer presupuesto desde <em>Nuevo pedido</em></li>
                <li>Importar tu catálogo CSV en <em>Productos</em></li>
              {{ end }}
            </ul>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;text-align:center">
          <p style="color:#6b7280;font-size:11.5px;margin:0;line-height:1.6">
            Si no te registraste vos, podés ignorar este email.<br>
            {{ if eq (index .Data.allowed_sites 0) "host" }}ANMA Regalos{{ else }}ANMA Pro{{ end }} · Hecho en Argentina 🇦🇷
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 🔁 Template 2 — Reset Password

**Subject:** `🔐 Recuperá tu acceso a ANMA`

```html
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f3f4f6">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">

        <tr><td style="background:linear-gradient(135deg,#7C3AED,#a78bfa);padding:36px 32px;text-align:center">
          <div style="display:inline-block;width:54px;height:54px;background:#fff;border-radius:16px;line-height:54px;margin-bottom:14px;font-size:24px">🔐</div>
          <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Recuperá tu acceso</h1>
        </td></tr>

        <tr><td style="padding:30px 36px">
          <p style="color:#374151;font-size:14.5px;line-height:1.7;margin:0 0 20px">
            Recibimos un pedido para resetear tu contraseña. Hacé click acá para elegir una nueva:
          </p>
          <table cellpadding="0" cellspacing="0" align="center">
            <tr><td style="background:linear-gradient(135deg,#7C3AED,#6D28D9);border-radius:12px">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:14.5px;font-weight:700">
                Cambiar mi contraseña
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:12px;margin:24px 0 0;text-align:center;line-height:1.6">
            <strong>Si no fuiste vos</strong>, ignorá este email. Tu contraseña actual sigue funcionando.<br><br>
            El link vence en 1 hora por seguridad.
          </p>
        </td></tr>

        <tr><td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;text-align:center">
          <p style="color:#9ca3af;font-size:11px;margin:0">ANMA · Tu negocio en un solo lugar</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

> **Nota:** este template no necesita branching Pro/Regalos porque el reset password es un mensaje neutro. La URL que recibe el user ya lo lleva al dominio correcto donde hizo el reset (anma-hub o anma-host).

---

## 👥 Template 3 — Invite User (admin invita a operador)

**Subject:** `🎯 Te invitaron a colaborar en ANMA`

```html
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f3f4f6">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">

        {{ if eq (index .Data.allowed_sites 0) "host" }}
        <tr><td style="background:linear-gradient(135deg,#7C3AED,#D946EF);padding:36px 32px;text-align:center">
          <div style="display:inline-block;width:54px;height:54px;background:#fff;border-radius:16px;line-height:54px;margin-bottom:14px;font-size:24px">🎁</div>
          <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Te invitaron a ANMA Regalos</h1>
        </td></tr>
        {{ else }}
        <tr><td style="background:linear-gradient(135deg,#4C1D95,#7C3AED 50%,#6366F1);padding:36px 32px;text-align:center">
          <div style="display:inline-block;width:54px;height:54px;background:#fff;border-radius:16px;line-height:54px;margin-bottom:14px;font-size:24px">🎯</div>
          <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Te invitaron a ANMA Pro</h1>
        </td></tr>
        {{ end }}

        <tr><td style="padding:30px 36px">
          <p style="color:#374151;font-size:14.5px;line-height:1.7;margin:0 0 14px">
            Hola! Acabás de ser invitado a trabajar en el workspace de
            <strong>{{ .Data.business_name }}</strong>.
          </p>
          <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 22px">
            Aceptá la invitación y elegí tu contraseña para entrar:
          </p>
          <table cellpadding="0" cellspacing="0" align="center">
            <tr><td style="background:linear-gradient(135deg,{{ if eq (index .Data.allowed_sites 0) "host" }}#D946EF,#EC4899{{ else }}#7C3AED,#6366F1{{ end }});border-radius:12px">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:14.5px;font-weight:700">
                Aceptar invitación
              </a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;text-align:center">
          <p style="color:#9ca3af;font-size:11px;margin:0">
            {{ if eq (index .Data.allowed_sites 0) "host" }}ANMA Regalos{{ else }}ANMA Pro{{ end }} · Acceso colaborativo
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## ⚙️ Cómo configurarlo paso a paso

### 1. Entrá al panel de templates
👉 `https://supabase.com/dashboard/project/paxsvjdimqlfxnlipplx/auth/templates`

(Si estás en el panel general: Authentication → Emails → Templates)

### 2. Para cada uno de los 3 templates (Confirm signup, Reset Password, Invite user):
- **Subject** (campo "Subject heading"): pegá el subject que dice arriba (con emoji incluido)
- **Message body**: cliqueá **"Source"** o **"HTML"** (NO el modo visual), borrá todo el contenido por defecto y pegá el bloque HTML completo
- Botón verde **Save changes**

### 3. URL Configuration (CRÍTICO para que los links funcionen)
En el sidebar de Authentication → **URL Configuration**:

- **Site URL**: dejá `https://anma-hub.vercel.app` (es el default)
- **Redirect URLs** (Add URL para cada uno):
  - `https://anma-hub.vercel.app/**`
  - `https://anma-host.vercel.app/**`
  - `http://localhost:5173/**` (para dev local)
  - `http://localhost:5174/**` (si corrés ambas apps en paralelo)

Esto garantiza que el `{{ .ConfirmationURL }}` redirija al dominio correcto desde donde el user se registró.

### 4. Probá enviando un signup desde Pro y otro desde Regalos
- Registrate desde `https://anma-hub.vercel.app/registro` → te debe llegar email **violeta-verde "ANMA Pro"** 🚀
- Registrate (con otro email) desde `https://anma-host.vercel.app/registro` → te debe llegar email **violeta-fucsia "ANMA Regalos"** 🎁

Si recibís el mismo, revisá el código de Registro.jsx — debe estar pasando `allowed_sites: ['hub']` o `['host']` en `signUp.options.data`.

---

## 🛟 ¿Qué hago si ya pegué el viejo template solo "ANMA Pro"?

**Borrá lo pegado y pegá la versión nueva**. El template anterior no rompe nada (manda emails OK), pero todos los users — incluso los que se registran desde Regalos — reciben branding de Pro.

La nueva versión **detecta automáticamente** desde qué app vino el signup y muestra el branding apropiado.

---

## 📦 SMTP propio (recomendado en producción)

Por default Supabase usa su SMTP con límite de ~3-4 emails/hora.

Si crecés y necesitás más volumen:
- **Authentication → Emails → SMTP Settings** (botón "Set up SMTP" arriba)
- Opciones simples:
  - **Gmail SMTP** (con [App Password](https://myaccount.google.com/apppasswords) — 100/día gratis)
  - **Brevo** (300 emails/día gratis) — `smtp-relay.brevo.com:587`
  - **MailerSend** (3.000/mes gratis) — `smtp.mailersend.net:587`

**No es urgente.** El SMTP default de Supabase alcanza para los primeros ~50 signups/mes que vas a tener.

---

## ❓ Preguntas frecuentes

**¿Y el TrialReminderModal del día 5/7? ¿Lo configuro acá?**
No. Esos NO son emails — son modales **dentro de la app**, que ya pusimos en el código. No requieren config en Supabase.

**¿Y cuando el user paga $120k? ¿Le llega un email?**
Hoy NO automático. Mercado Pago le manda el comprobante de pago. Vos te enterás vía el Admin (Realtime + browser notification). Si querés mandar un email custom de "Pago confirmado", lo agregamos en Parte 3 con una Edge Function.

**¿Las invitaciones a operadores andan?**
Sí, automáticamente — Supabase Auth las maneja. El template 3 (Invite user) es el que reciben.

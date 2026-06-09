# 📧 Supabase Auth — Email Templates personalizados

Esta guía te explica **qué pegar en cada template** del Dashboard de Supabase para que los emails que se mandan automáticamente al usuario sean profesionales y on-brand, **sin Resend ni servicio externo**.

---

## ¿Cómo funciona?

Supabase manda los emails de autenticación **automáticamente** desde su SMTP propio cuando ocurren estos eventos:

| Trigger | Cuándo se manda | Template a editar |
|---|---|---|
| Signup | User completa registro (si confirmación email está ON) | **Confirm signup** |
| Invitación | Admin invita a un operador desde `/admin` | **Invite user** |
| Magic link | User pide login passwordless | **Magic Link** |
| Reset password | User olvidó su contraseña | **Reset Password** |
| Cambio email | User cambia su email | **Change Email Address** |

Los templates se editan en:
**Supabase Dashboard → Authentication → Email Templates**

---

## 📋 Variables disponibles

Supabase te expone estas variables en los templates:

- `{{ .ConfirmationURL }}` — el link de acción (siempre presente)
- `{{ .Token }}` — el código OTP de 6 dígitos (alternativa al link)
- `{{ .TokenHash }}` — hash del token (uso técnico)
- `{{ .SiteURL }}` — la URL configurada en Supabase (ej: `https://anma-host.vercel.app`)
- `{{ .Email }}` — email del destinatario
- `{{ .Data }}` — metadata custom (lo que pasaste en `auth.signUp({options: {data: {...}}})`)
  - `{{ .Data.business_name }}` → el nombre del negocio
  - `{{ .Data.is_trial }}` → si está en trial

---

## ✉️ Template 1 — Confirm Signup (BIENVENIDA)

Subject: `🚀 ¡Bienvenido a ANMA Regalos! Activá tu cuenta`

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f3f4f6">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">

        <!-- Header con gradient -->
        <tr><td style="background:linear-gradient(135deg,#7C3AED,#D946EF);padding:40px 32px;text-align:center">
          <div style="display:inline-block;width:60px;height:60px;background:#fff;border-radius:18px;line-height:60px;margin-bottom:16px;font-size:28px">🚀</div>
          <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;letter-spacing:-.3px">¡Estás adentro!</h1>
          <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px">7 días para descubrir cómo ANMA Regalos ordena tu negocio</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 36px">
          <p style="color:#1f2937;font-size:15px;line-height:1.7;margin:0 0 20px">
            Hola <strong>{{ .Data.business_name }}</strong>! 👋
          </p>
          <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 24px">
            Activá tu cuenta haciendo click en el botón de abajo. Te toma 5 segundos:
          </p>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" align="center">
            <tr><td style="background:linear-gradient(135deg,#D946EF,#EC4899);border-radius:12px;box-shadow:0 8px 24px rgba(5,150,105,.35)">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:15px;font-weight:700">
                ✓ Confirmar mi email
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:24px 0 0;text-align:center">
            O copiá este link en tu navegador:<br>
            <span style="color:#7C3AED;word-break:break-all">{{ .ConfirmationURL }}</span>
          </p>

          <!-- Tips -->
          <div style="margin-top:32px;padding:20px;background:#f9fafb;border-radius:12px;border-left:3px solid #7C3AED">
            <p style="color:#1f2937;font-size:13px;font-weight:700;margin:0 0 10px">💡 Lo primero que podés hacer:</p>
            <ul style="color:#4b5563;font-size:13px;line-height:1.7;margin:0;padding-left:20px">
              <li>Cargar tu primer cliente desde <em>Clientes</em></li>
              <li>Armar tu primer presupuesto desde <em>Nuevo pedido</em></li>
              <li>Importar tu catálogo CSV en <em>Productos</em></li>
            </ul>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;text-align:center">
          <p style="color:#6b7280;font-size:11.5px;margin:0;line-height:1.6">
            Si no te registraste vos, podés ignorar este email.<br>
            ANMA Regalos · Hecho en Argentina 🇦🇷
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 🔁 Template 2 — Reset Password (recuperación)

Subject: `🔐 Recuperá tu acceso a ANMA Regalos`

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
          <p style="color:#9ca3af;font-size:11px;margin:0">ANMA Regalos · Tu negocio en un solo lugar</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 👥 Template 3 — Invite User (admin invita a operador)

Subject: `🎯 {{ .Data.invited_by }} te invitó a ANMA Regalos`

```html
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f3f4f6">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
        <tr><td style="background:linear-gradient(135deg,#D946EF,#EC4899);padding:36px 32px;text-align:center">
          <div style="display:inline-block;width:54px;height:54px;background:#fff;border-radius:16px;line-height:54px;margin-bottom:14px;font-size:24px">🎯</div>
          <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Te invitaron a ANMA Regalos</h1>
        </td></tr>
        <tr><td style="padding:30px 36px">
          <p style="color:#374151;font-size:14.5px;line-height:1.7;margin:0 0 14px">
            Hola! Acabás de ser invitado a trabajar en el workspace de
            <strong>{{ .Data.business_name }}</strong> en ANMA Regalos.
          </p>
          <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 22px">
            Aceptá la invitación y elegí tu contraseña para entrar:
          </p>
          <table cellpadding="0" cellspacing="0" align="center">
            <tr><td style="background:linear-gradient(135deg,#D946EF,#BE185D);border-radius:12px">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:14.5px;font-weight:700">
                Aceptar invitación
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e5e7eb;text-align:center">
          <p style="color:#9ca3af;font-size:11px;margin:0">ANMA Regalos · Acceso colaborativo</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## ⚙️ Cómo configurarlo (5 minutos)

1. Entrá a **Supabase Dashboard** → tu proyecto
2. Sidebar → **Authentication** → **Email Templates**
3. Para cada template (Confirm signup, Reset password, Invite user):
   - **Subject**: pegá el subject indicado arriba
   - **Message body**: cliqueá "Source" o "HTML" y pegá el bloque de código completo
   - **Save**

### Configuración del Site URL
Asegurate que en **Authentication → URL Configuration**:
- **Site URL** = `https://anma-host.vercel.app` (Pro) o `https://anma-host.vercel.app` (Regalos)
- **Redirect URLs** incluye:
  - `https://anma-host.vercel.app/**`
  - `https://anma-host.vercel.app/**`
  - `http://localhost:5173/**` (para dev)

### Custom SMTP (opcional, recomendado en producción)
Por default Supabase usa su propio SMTP con un límite de ~3-4 emails/hora por proyecto en plan free.

Si crecés, configurar SMTP propio es trivial:
- **Authentication → Settings → SMTP Settings**
- Podés usar Gmail (envía con tu cuenta personal), Brevo (300 emails/día gratis), MailerSend, o el SMTP de tu hosting

**Gmail SMTP (la opción más simple para empezar):**
- Host: `smtp.gmail.com`
- Port: `587`
- Username: tu email
- Password: [App password](https://myaccount.google.com/apppasswords) (no la del email)
- Sender email: tu email
- Sender name: `ANMA Regalos`

---

## 🎁 Los emails de día 5/7 los hacemos in-app

**Decisión consciente**: en lugar de mandar 4 emails de trial, hacemos los recordatorios **dentro de la app** con `TrialReminderModal`.

Razones:
- 100% open rate (el user los ve sí o sí cuando abre la app)
- Cero costo y cero dependencia externa
- Mejor UX: el CTA va a WhatsApp directamente, no a otro link

Los 3 emails de Supabase Auth (signup, reset, invite) cubren los flows críticos. **No necesitás más.**

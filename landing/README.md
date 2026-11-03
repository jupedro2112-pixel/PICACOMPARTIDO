# Carpeta `landing/` = la landing publicada en Vercel (picaroja-landing.vercel.app)

Es la landing que el owner tiene publicada en Vercel (vino en `landing2.zip`, 2026-10-19). NO la sirve este
backend: se sube a Vercel a mano (arrastrar la carpeta en el proyecto `picaroja-landing`, o `vercel deploy`).

**#1023 (2026-11-03):** la landing es la de **CARGASGIROXactivo** (bono grande + nombre + botón, sin carrusel de juegos ni lista de
servicios ni plataformas), adaptada a PICA ROJA = **carga AUTOMÁTICA sin agente**: pitch "transferís, mandás el comprobante y la carga
se acredita sola", línea de confianza (carga automática 24 hs · retiros a tu CBU · soporte por chat) y bloque "Sin agente, sin
esperas" con la **carga mínima** real (`minDepositArs` de `GET /api/landing/info`; fijo $2.000 si no responde). Se conservó TODO el
cableado de PICA: `?ref=` (referido), `API_BASE_DEFAULT` rapidogirox.com, override `?api=` sólo al entorno de prueba (#553),
redirección sólo al backend (#553), píxel por campaña (#797), escape del webview de IG/FB/TikTok (#260), dedup por dispositivo.
Sólo queda `img/picaroja.png` (logo); se borraron los logos de plataformas y las fotos de juegos que ya no se usan.

`vercel.json` (#553): SÓLO reescrituras para que `picaroja-landing.vercel.app/CODIGO` sirva la landing (Vercel sirve primero los
archivos reales, `img/` incluido). ⚠️ NO subir el `vercel.json`/`blank.html` del zip original: mandaban a una página en blanco a todo visitante fuera de Argentina (y a quien
entra por VPN/Tor, como el owner desde Tails). Se sacaron el 2026-10-19 (#543).

Antes de subir, revisá en `index.html`:
- `API_BASE_DEFAULT` = `https://rapidogirox.com` (#1020, owner 2026-11-03; antes `https://picaroja.com`, #570). El código de campaña
  de la URL tiene que existir y estar ACTIVO en ESE backend (está en modo registro 'invite'). NO `vipcargas.com` (es VIPCARGAS, otra página) ni
  `chat1girox.com` ni el host `.elasticbeanstalk.com` (sólo HTTP).
- Ese dominio tiene que tener el dominio de la landing en `ALLOWED_ORIGINS` (CORS), si no el registro falla en el navegador.
- `BONUS_BIG` / `BONUS_SUB`: la oferta REAL (misma que ve el usuario; Meta penaliza el cloaking).

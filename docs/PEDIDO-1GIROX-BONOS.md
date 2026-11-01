# Pedido a 1girox — herramientas contra el fraude con bonos (#996, 2026-11-01)

Hoy la Partner API (v1.15) da, por jugador y rango, totales de apostado / pagado / netwin / bono otorgado, separados en casino y
deportes. Con eso detectamos el RASTRO del fraude (resultado demasiado parejo, grupos que se compensan, ciclos bono → retiro), pero
**no podemos ver apuesta por apuesta**, que es lo que haría falta para demostrar "dos cuentas apostaron lados opuestos en la misma mesa,
en el mismo minuto". Pedimos, en orden de importancia:

1. **Historial de apuestas por jugador (y por lote de jugadores)** con: fecha y hora de cada apuesta, juego / proveedor, mesa o ronda
   (id de la mano / del giro / del evento deportivo), lado o mercado apostado (Banca/Jugador/Empate, rojo/negro, local/empate/visitante),
   monto, resultado y si se jugó con saldo de bono. Rango máximo razonable (48–72 h) y batch de hasta 100 usernames, igual que `/stats/batch`.
   Con esto cruzamos automáticamente "mismo id de ronda + lados opuestos" entre cuentas.
2. **Ponderación de juegos para el rollover del bono:** que baccarat, ruleta en dinero parejo, blackjack y deportes con cuota < 1,50
   cuenten 0–20 % (o nada) para liberar el bono. Es la defensa estándar del rubro y corta el problema de raíz.
3. **Apuesta máxima mientras hay bono activo** (configurable por nosotros, ej. $5.000 por mano), con rechazo de la apuesta si se pasa.
4. **Bloqueo de apuestas cubiertas:** rechazar (o no contar para el rollover) apostar a los dos lados de la misma mano / giro / evento.
5. **Confirmación técnica:** ¿una `reference` usada en `POST /bonus` también deduplica un `POST /deposit` con la misma reference (y al
   revés)? Lo necesitamos para reintentos seguros cuando un regalo cambia de ruta entre un intento y su reintento.

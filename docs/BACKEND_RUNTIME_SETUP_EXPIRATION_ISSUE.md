# Backend Issue Report — Setup expira inmediatamente en runtime (leg_continuation_m5_m1)

## Resumen
En runtime de la estrategia `leg_continuation_m5_m1`, el frontend muestra `SETUP ACTIVO` y, pocos segundos después, dispara `Setup expirado sin entrada`, aunque operativamente todavía debería existir setup válido (legs A/B definidos y ventana activa).

Esto sugiere inconsistencia de estado en snapshots del backend (`current_setup` desaparece o `search_end` llega vencido prematuramente).

## Contexto observado
- Pantalla: `Strategy runtime` (bot detail)
- Stage visto: `WAITING_M5_BREAKOUT`
- Estado visible: `SETUP ACTIVO` -> luego `SETUP EXPIRADO`
- Countdown observado: llega rápido a `00:00`

## Evidencia en frontend (solo para diagnóstico)
Archivo:
- `C:\Users\franc\OneDrive\Escritorio\Proyectos\forex-bot-next\app\(dashboard)\bots\[botId]\page.tsx`

Lógica que dispara expiración (`Setup expirado sin entrada`):
- Condición: había `setupKey` previo, snapshot actual sin `setupKey`, no aumentaron operaciones abiertas, y `now > previous.searchEndMs`.
- Referencia aproximada: líneas `1108–1114`.

Conclusión: el frontend **no expira por timeout local aislado**; necesita además que el backend deje de enviar `current_setup` (o envíe `search_end` ya vencido).

## Comportamiento esperado
Si existe setup válido de continuidad (A/B definidos) y no hay invalidación estructural real:
1. `current_setup` debe mantenerse estable entre snapshots.
2. `search_end` debe reflejar ventana real (sin desfase de zona horaria / unidad).
3. Gaps breves de market stream no deberían descartar setup inmediatamente.

## Comportamiento actual
Se observa secuencia intermitente:
1. backend entrega setup vigente,
2. snapshot siguiente llega sin `current_setup` (o con ventana vencida),
3. frontend interpreta expiración y notifica `Setup expirado sin entrada`.

## Hipótesis raíz (prioridad)
1. **Volatilidad del estado backend ante gaps de stream**: al perder ticks/candles brevemente, se limpia `current_setup` de forma agresiva.
2. **Problema temporal** (`search_end`):
   - timezone inconsistente,
   - timestamp en segundos vs milisegundos en algún tramo,
   - clock skew entre procesos.
3. **Reseteo de máquina de estados** hacia espera de setup sin razón estructural fuerte.

## Pedido para Backend
Implementar robustez de estado para `leg_continuation_m5_m1`:

1. **Sticky setup con tolerancia de feed**
   - No limpiar `current_setup` por microcortes de stream.
   - Agregar grace period explícito (ej. N segundos / M velas) antes de invalidar por falta de datos.

2. **Contrato temporal explícito**
   - Normalizar `search_start`, `search_end`, `breakout_time` en ISO UTC o epoch ms consistente.
   - Garantizar una sola convención (sin mezcla sec/ms).

3. **Razonamiento de invalidación en payload**
   - Incluir campo de diagnóstico, por ejemplo:
     - `setup_status_reason`: `active | expired_window | invalidated_structure | stream_gap | reset`
   - Incluir `server_now_utc` para depurar desfasajes.

4. **No borrar `current_setup` silenciosamente**
   - Si el setup se invalida, enviar motivo y timestamp de invalidación.

## Telemetría mínima recomendada (logs)
Por cada transición de setup:
- `bot_id`, `symbol`, `strategy`, `stage_prev`, `stage_next`
- `had_current_setup_prev`, `has_current_setup_next`
- `search_start`, `search_end`, `server_now`
- `invalidation_reason`
- `stream_health` (tick/candle lag, reconnect count)

## Criterios de aceptación
1. Con gaps breves de stream, `current_setup` no desaparece inmediatamente.
2. `SETUP ACTIVO` no salta a `SETUP EXPIRADO` salvo cuando realmente vence ventana o se invalida estructura.
3. Toda expiración/invalidez trae `reason` explícito en runtime state.
4. Timestamps consistentes verificables (sin ambigüedad sec/ms/timezone).

## Impacto
Este bug induce falsos negativos operativos y confusión de monitoreo: parece que la estrategia "detecta setup pero se rompe" en loop.

## Prioridad sugerida
Alta (afecta confianza en runtime y diagnóstico de entrada).

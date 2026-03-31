# Open Segment Levels (Cont/Rev) - Spec de Validacion Backend

## Objetivo
Cuando el tramo mas reciente aun no confirma una nueva leg (por pivots/estructura), mostrar y evaluar **dos niveles simultaneos**:

- `Cont` (continuation): nivel para continuar el ultimo leg confirmado.
- `Rev` (reversal): nivel para revertir al sentido opuesto.

Esto evita perder contexto operativo en velas aun no encasilladas en leg cerrada.

## Base de calculo de legs
Las legs se construyen con la misma logica de estrategia (no por color de vela):

1. `find_pivots(strength)` sobre OHLC.
2. `compress_pivots()` (mismo tipo consecutivo -> conservar pivot mas extremo).
3. `build_legs_extended()`:
   - Bullish se mantiene mientras estructura no invalide con LL segun referencia.
   - Bearish se mantiene mientras estructura no invalide con HH segun referencia.
   - El cambio de leg es estructural, no por una vela opuesta.

## Definicion de "open segment"
Hay open segment cuando existen velas posteriores al `endIdx` del ultimo leg confirmado:

- `has_unconfirmed_tail = (last_candle_index > last_leg.endIdx)`

Si `false`, no se muestran niveles `Cont/Rev` extra (solo niveles normales de leg).

## Niveles Cont/Rev (regla exacta)
Sea `last_leg` el ultimo leg confirmado.

### Caso A: `last_leg.direction == bearish`
- `Cont bear = last_leg.endPrice` (low estructural de la leg).
- `Rev bull = last_leg.startPrice` (high estructural de la leg).

### Caso B: `last_leg.direction == bullish`
- `Cont bull = last_leg.endPrice` (high estructural de la leg).
- `Rev bear = last_leg.startPrice` (low estructural de la leg).

## Criterio de confirmacion de ruptura
En estrategia `leg_continuation`, por defecto:

- `breakout_basis = "close"` (ver `strategy_params.py`).

Por lo tanto, validar ruptura por **cierre**:

- Si `Cont bear`: confirmar cuando `close < Cont`.
- Si `Cont bull`: confirmar cuando `close > Cont`.
- Si `Rev bull`: confirmar cuando `close > Rev`.
- Si `Rev bear`: confirmar cuando `close < Rev`.

## Contrato recomendado backend para auditar front
Para eliminar ambiguedad entre front/runtime, backend deberia exponer en runtime state:

- `last_leg`:
  - `direction` (`bullish|bearish`)
  - `start_price`
  - `end_price`
  - `start_time`
  - `end_time`
- `has_unconfirmed_tail` (bool)
- `cont_level` (number)
- `rev_level` (number)
- `breakout_basis` (`close|wick`)  # hoy esperado: `close`
- `break_status`:
  - `cont_broken` (bool)
  - `rev_broken` (bool)
  - `last_break_time` (optional)
  - `last_break_side` (`cont|rev`, optional)

## Checklist rapido de validacion
1. Con open segment activo, backend devuelve ambos niveles (`cont_level`, `rev_level`).
2. Si ultima leg es bearish: `cont_level == end_price` y `rev_level == start_price`.
3. Si ultima leg es bullish: `cont_level == end_price` y `rev_level == start_price`.
4. La transicion de etapa usa `breakout_basis=close` (no solo mecha), salvo override explicito.
5. Al confirmar nueva leg, `has_unconfirmed_tail` y niveles se recalculan contra el nuevo `last_leg`.


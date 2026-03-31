# Reporte para Backend: Problema de Historico de Velas en Front (Bots Runtime)

## Contexto
- Frontend: `forex-bot-next`
- Vista afectada: detalle de bot en runtime (`/bots/[botId]`), graficos M5/M1 (estrategia `leg_continuation_m5_m1`)
- Fecha de observacion: **2026-03-31**

## Problema observado
En el frontend solo se visualizan **4 velas** (fallback de `strategyRuntimeState`) en lugar del historico completo.

El frontend intenta cargar historico por `/api/history/:symbol/:timeframe`, pero recibe principalmente `404` con muchas variantes de timeframe/query.

## Evidencia concreta (logs)
Se ven cientos de requests `404`, por ejemplo:
- `GET /api/history/USDCHF/5m?... -> 404`
- `GET /api/history/USDCHF/MINUTE_5?... -> 404`
- `GET /api/history/USDCHF/M5?... -> 404`
- `GET /api/history/USDCHF/m1?... -> 404`

Tambien se ven algunos `200`, por ejemplo:
- `GET /api/history/USDCHF/MINUTE_1?... -> 200`
- `GET /api/history/USDCHF/5m?... -> 200`
- `GET /api/history/USDCHF/m5?... -> 200`
- `GET /api/history/USDCHF/m1?... -> 200`

Y `market hub` responde OK:
- `GET /api/market/hub/symbol/USDCHF -> 200`

## Hipotesis tecnica principal
El endpoint de historico parece:
1. **aceptar solo formatos puntuales** de `timeframe` y/o query params,
2. devolver `404` para el resto,
3. y/o devolver distintos shapes de payload segun la combinacion.

Esto provoca que el front caiga frecuentemente a fallback (`runtime last_4`).

## Impacto funcional
- No se puede navegar historico lateral como esperado.
- El usuario percibe que “solo hay 4 velas”.
- La visualizacion queda pobre para seguimiento de etapa/estructura de estrategia.

## Lo que necesitamos de backend (contrato estable)
### 1) Timeframes soportados (canonicos)
Definir y documentar un set unico (ejemplo):
- `M1`, `M5`, `M15`, `H1`, `H4`

### 2) Query params soportados (canonicos)
Definir y documentar un set unico (ejemplo):
- `start` (ISO o YYYY-MM-DD)
- `end` (ISO o YYYY-MM-DD)
- `limit` (int)

### 3) Respuesta estable (shape unico)
Ejemplo recomendado:
```json
{
  "instrument": "USDCHF",
  "timeframe": "M5",
  "count": 1234,
  "candles": [
    {
      "time": "2026-03-31T16:15:00Z",
      "open": 0.80231,
      "high": 0.80256,
      "low": 0.80227,
      "close": 0.80249
    }
  ]
}
```

### 4) Semantica de errores
- Si timeframe/query no es valido: `400` con mensaje claro.
- Evitar `404` ambiguo para combinaciones cercanas.

## Pruebas sugeridas en backend
1. Contrato de `GET /history/{instrument}/{timeframe}` para `M1` y `M5`.
2. Test de parseo de `start/end` (ISO + YYYY-MM-DD).
3. Test con `limit=2500`.
4. Test de shape de respuesta (siempre `candles[]` con campos OHLC + time).

## Nota
Con un contrato estable de `/history`, el front puede mostrar historico completo + zoom/pan sin depender del fallback de 4 velas.

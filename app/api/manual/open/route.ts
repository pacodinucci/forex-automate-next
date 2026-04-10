import { NextResponse } from "next/server";
import {
  backendFetch,
  parseBody,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

type ManualOpenPayload = {
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  // Frontend inputs are points from entry.
  stopLoss?: number;
  takeProfit?: number;
  // Backward compatibility: absolute prices.
  stop_loss?: number;
  take_profit?: number;
};

type MarketPricePayload = {
  price?: number;
  bid?: number;
  ask?: number;
};

function countDecimals(value: number) {
  const asText = value.toString();
  if (!asText.includes(".")) {
    return 0;
  }

  return asText.split(".")[1]?.length ?? 0;
}

function inferPointSize(symbol: string, referencePrice: number) {
  const decimals = countDecimals(referencePrice);
  if (decimals > 0) {
    return 10 ** -decimals;
  }

  const upperSymbol = symbol.toUpperCase();
  if (upperSymbol.endsWith("JPY")) {
    return 0.001;
  }
  return 0.00001;
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function POST(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const body = await parseBody<ManualOpenPayload>(request);
  const absoluteStopLoss = body.stop_loss;
  const absoluteTakeProfit = body.take_profit;

  let computedStopLoss: number | undefined;
  let computedTakeProfit: number | undefined;

  // If absolute prices are not provided, interpret stopLoss/takeProfit as points.
  if (
    (!Number.isFinite(absoluteStopLoss) || (absoluteStopLoss as number) <= 0) &&
    (!Number.isFinite(absoluteTakeProfit) || (absoluteTakeProfit as number) <= 0) &&
    ((Number.isFinite(body.stopLoss) && (body.stopLoss as number) > 0) ||
      (Number.isFinite(body.takeProfit) && (body.takeProfit as number) > 0))
  ) {
    const quoteResponse = await backendFetch(
      `/market/price?symbol=${encodeURIComponent(body.symbol)}`
    );

    if (quoteResponse.ok) {
      const quote = (await quoteResponse.json().catch(() => ({}))) as MarketPricePayload;
      const referencePrice =
        body.side === "buy"
          ? quote.ask ?? quote.price
          : quote.bid ?? quote.price;

      if (Number.isFinite(referencePrice)) {
        const decimals = Math.max(3, countDecimals(referencePrice as number));
        const pointSize = inferPointSize(body.symbol, referencePrice as number);
        const stopLossPoints = body.stopLoss;
        const takeProfitPoints = body.takeProfit;

        if (Number.isFinite(stopLossPoints) && (stopLossPoints as number) > 0) {
          const rawStop =
            body.side === "buy"
              ? (referencePrice as number) - (stopLossPoints as number) * pointSize
              : (referencePrice as number) + (stopLossPoints as number) * pointSize;
          computedStopLoss = roundTo(rawStop, decimals);
        }

        if (Number.isFinite(takeProfitPoints) && (takeProfitPoints as number) > 0) {
          const rawTakeProfit =
            body.side === "buy"
              ? (referencePrice as number) + (takeProfitPoints as number) * pointSize
              : (referencePrice as number) - (takeProfitPoints as number) * pointSize;
          computedTakeProfit = roundTo(rawTakeProfit, decimals);
        }
      }
    }
  }

  const payload = {
    symbol: body.symbol,
    side: body.side,
    volume: body.volume,
    ...(Number.isFinite(absoluteStopLoss) && (absoluteStopLoss as number) > 0
      ? { stop_loss: absoluteStopLoss }
      : {}),
    ...(Number.isFinite(absoluteTakeProfit) && (absoluteTakeProfit as number) > 0
      ? { take_profit: absoluteTakeProfit }
      : {}),
    ...(Number.isFinite(computedStopLoss) && (computedStopLoss as number) > 0
      ? { stop_loss: computedStopLoss }
      : {}),
    ...(Number.isFinite(computedTakeProfit) && (computedTakeProfit as number) > 0
      ? { take_profit: computedTakeProfit }
      : {}),
  };

  const response = await backendFetch("/manual/open", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return relayBackendResponse(response);
}

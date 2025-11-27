import { NextResponse } from "next/server";
import { auth } from "@/lib/auth"; // Better Auth
import prisma from "@/lib/db";
import { tradingApi } from "@/lib/trading-api";

type FastApiBotInfo = {
  id: string;
  instrument: string;
  trend_tf: string;
  jw_tf: string;
  running: boolean;
};

export async function GET(req: Request) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bots = await prisma.bot.findMany({
    where: { userId: session.user.id }, // si tu modelo tiene userId
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(bots);
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { instrument, trend_tf = "M30", jw_tf = "M5", name } = body;

  const botName =
    name ?? `${instrument} ${trend_tf.toUpperCase()}/${jw_tf.toUpperCase()}`;

  // 1) crear bot en FastAPI (motor)
  const fastBot = await tradingApi<FastApiBotInfo>("/bots", {
    method: "POST",
    body: JSON.stringify({ instrument, trend_tf, jw_tf }),
  });

  // 2) guardar en Neon
  const bot = await prisma.bot.create({
    data: {
      id: fastBot.id,
      userId: session.user.id,
      name: botName,
      instrument: fastBot.instrument,
      trendTimeframe: fastBot.trend_tf,
      signalTimeframe: fastBot.jw_tf,
      status: fastBot.running ? "RUNNING" : "STOPPED",
    },
  });

  return NextResponse.json(bot, { status: 201 });
}

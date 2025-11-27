-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('RUNNING', 'PAUSED', 'STOPPED', 'ERROR');

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "riskPercent" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 1,
    "trendTimeframe" TEXT NOT NULL DEFAULT 'M30',
    "signalTimeframe" TEXT NOT NULL DEFAULT 'M5',
    "status" "BotStatus" NOT NULL DEFAULT 'PAUSED',
    "lastError" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

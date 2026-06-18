-- MIGRACIÓN FASE A - POSTGRESQL (Para ejecutar en Supabase)

-- 1. Crear tabla User
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "normalizedUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Crear índice único en normalizedUsername
CREATE UNIQUE INDEX IF NOT EXISTS "User_normalizedUsername_key" ON "User"("normalizedUsername");

-- 2. Crear tabla Session
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Crear índice único en tokenHash
CREATE UNIQUE INDEX IF NOT EXISTS "Session_tokenHash_key" ON "Session"("tokenHash");

-- 3. Crear tabla AuthAttempt para rate limiting persistente
CREATE TABLE IF NOT EXISTS "AuthAttempt" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "username" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- 4. Añadir columnas userId (nullable) a Prediction y Score
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Score" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- 5. Eliminar los índices únicos antiguos en matchId
DROP INDEX IF EXISTS "Prediction_matchId_key";
DROP INDEX IF EXISTS "Score_matchId_key";

-- 6. Añadir llaves foráneas con eliminación en cascada
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey";
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Prediction" DROP CONSTRAINT IF EXISTS "Prediction_userId_fkey";
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Score" DROP CONSTRAINT IF EXISTS "Score_userId_fkey";
ALTER TABLE "Score" ADD CONSTRAINT "Score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

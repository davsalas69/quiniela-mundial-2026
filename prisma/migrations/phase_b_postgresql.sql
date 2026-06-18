-- MIGRACIÓN FASE B - POSTGRESQL (Para ejecutar en Supabase después de realizar el Setup del Administrador)

-- 1. Establecer userId como NOT NULL en Prediction y Score
ALTER TABLE "Prediction" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Score" ALTER COLUMN "userId" SET NOT NULL;

-- 2. Crear índices únicos compuestos (userId + matchId) para evitar predicciones/puntajes duplicados
CREATE UNIQUE INDEX IF NOT EXISTS "Prediction_userId_matchId_key" ON "Prediction"("userId", "matchId");
CREATE UNIQUE INDEX IF NOT EXISTS "Score_userId_matchId_key" ON "Score"("userId", "matchId");

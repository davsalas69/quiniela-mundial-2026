-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalApiId" TEXT,
    "stage" TEXT NOT NULL,
    "groupName" TEXT,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "kickoffAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "actualHomeScore" INTEGER,
    "actualAwayScore" INTEGER,
    "actualHomePenalties" INTEGER,
    "actualAwayPenalties" INTEGER,
    "actualWinner" TEXT,
    "resultSource" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "predictedHomeScore" INTEGER,
    "predictedAwayScore" INTEGER,
    "predictedHomePenalties" INTEGER,
    "predictedAwayPenalties" INTEGER,
    "predictedWinner" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Score_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_matchId_key" ON "Prediction"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_matchId_key" ON "Score"("matchId");

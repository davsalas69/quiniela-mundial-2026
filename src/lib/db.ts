import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const getProviderFromSchema = (): 'postgresql' | 'sqlite' => {
  try {
    const pathsToTry = [
      path.join(process.cwd(), 'prisma', 'schema.prisma'),
      path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
      path.join(__dirname, '..', 'prisma', 'schema.prisma'),
      path.join(__dirname, 'prisma', 'schema.prisma')
    ];
    for (const schemaPath of pathsToTry) {
      if (fs.existsSync(schemaPath)) {
        const content = fs.readFileSync(schemaPath, 'utf8');
        if (content.includes('provider = "sqlite"')) {
          return 'sqlite';
        }
      }
    }
  } catch (e) {
    // Fallback if file not readable or not found
  }
  return 'postgresql';
};

const isSqlite = getProviderFromSchema() === 'sqlite';
const databaseUrl = process.env.DATABASE_URL || (isSqlite ? 'file:./dev.db' : 'postgresql://localhost:5432/dummy');

const getPrismaClient = (): PrismaClient => {
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  } else {
    // In Prisma 7, PrismaLibSql constructor takes the Config object directly, not a client instance
    const adapter = new PrismaLibSql({ url: databaseUrl });
    return new PrismaClient({ adapter });
  }
};

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

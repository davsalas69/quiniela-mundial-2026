import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';

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

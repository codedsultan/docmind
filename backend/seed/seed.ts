import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';

const TEST_USERS = [
  { email: 'alice@test.com', password: 'password123' },
  { email: 'bob@test.com', password: 'password123' },
  { email: 'admin@docmind.io', password: 'admin123!' },
] as const;

async function seedUsers(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not defined');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Seeding users...');

    for (const user of TEST_USERS) {
      const email = user.email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        console.log(`  SKIP — ${email} already exists`);
        continue;
      }

      const passwordHash = await argon2.hash(user.password);
      await prisma.user.create({
        data: { email, passwordHash },
      });
      console.log(`  CREATED — ${email}`);
    }

    console.log('Done seeding users.');
  } finally {
    await prisma.$disconnect();
  }
}

seedUsers().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

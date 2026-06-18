const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');

try {
  if (!fs.existsSync(schemaPath)) {
    console.error('Error: prisma/schema.prisma not found.');
    process.exit(1);
  }

  const content = fs.readFileSync(schemaPath, 'utf8');

  // Verify that the provider is set to postgresql (checking the datasource db block)
  const dbBlockRegex = /datasource\s+db\s*\{[^}]*\}/s;
  const match = content.match(dbBlockRegex);

  if (!match) {
    console.error('Error: Could not find datasource db block in prisma/schema.prisma');
    process.exit(1);
  }

  const dbBlock = match[0];
  const providerRegex = /provider\s*=\s*["']postgresql["']/i;

  if (!providerRegex.test(dbBlock)) {
    console.error('\n================================================================');
    console.error('❌ BUILD ERROR: prisma/schema.prisma is NOT configured for PostgreSQL!');
    console.error('Production builds require `provider = "postgresql"` in schema.prisma.');
    console.error('Current datasource config:\n' + dbBlock.trim());
    console.error('Please run: npm run db:postgresql before building or staging.');
    console.error('================================================================\n');
    process.exit(1);
  }

  console.log('✅ prisma/schema.prisma validation passed: PostgreSQL provider verified.');
  process.exit(0);
} catch (error) {
  console.error('Error verifying production schema:', error);
  process.exit(1);
}

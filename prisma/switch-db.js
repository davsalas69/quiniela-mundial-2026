const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dbType = process.argv[2];
if (dbType !== 'sqlite' && dbType !== 'postgresql') {
  console.error('Uso: node prisma/switch-db.js [sqlite|postgresql]');
  process.exit(1);
}

const schemaPath = path.join(__dirname, 'schema.prisma');
let schemaContent = fs.readFileSync(schemaPath, 'utf8');

if (dbType === 'postgresql') {
  // Cambiar sqlite a postgresql
  schemaContent = schemaContent.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
  console.log('Cambiando proveedor de base de datos a: PostgreSQL...');
} else {
  // Cambiar postgresql a sqlite
  schemaContent = schemaContent.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
  console.log('Cambiando proveedor de base de datos a: SQLite...');
}

fs.writeFileSync(schemaPath, schemaContent, 'utf8');

console.log('Ejecutando npx prisma generate...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('¡Cliente de Prisma regenerado exitosamente para ' + dbType + '!');
} catch (error) {
  console.error('Error al ejecutar prisma generate:', error.message);
  process.exit(1);
}

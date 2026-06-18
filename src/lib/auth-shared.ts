/**
 * Sugerir código de acceso en base a un nombre de jugador.
 * Ejemplo: David -> DAVID26
 */
export function generateSuggestedCode(username: string): string {
  if (!username) return '';
  const normalized = username
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ''); // Solo caracteres alfanuméricos

  if (!normalized) return '';
  return `${normalized}26`;
}

/**
 * Validar código de acceso de jugador.
 * Reglas:
 * - Entre 4 y 12 caracteres.
 * - Solo letras y números (sin espacios).
 * - No permitir códigos débiles comunes (1234, 0000, admin, password, contraseña).
 * - No permitir el nombre exacto del usuario sin variaciones ni números.
 */
export function validateAccessCode(code: string, username: string): { valid: boolean; message?: string } {
  // El código debe ser normalizado en mayúsculas
  const normalizedCode = code.trim().toUpperCase();

  // 1. Longitud entre 4 y 12 caracteres
  if (normalizedCode.length < 4 || normalizedCode.length > 12) {
    return { valid: false, message: 'El código de acceso debe tener entre 4 y 12 caracteres.' };
  }

  // 2. Letras y números, sin espacios
  if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
    return { valid: false, message: 'El código de acceso solo puede contener letras y números (sin espacios).' };
  }

  // 3. Códigos débiles comunes
  const weakCodes = ['1234', '0000', 'ADMIN', 'PASSWORD', 'CONTRASENA', 'CONTRASEÑA'];
  if (weakCodes.includes(normalizedCode)) {
    return { valid: false, message: 'El código de acceso es muy débil. Por favor elige otro.' };
  }

  // 4. Nombre exacto del usuario (sin variaciones ni números)
  const normalizedUser = username
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (normalizedCode === normalizedUser) {
    return { valid: false, message: 'El código de acceso no puede ser idéntico a tu nombre de usuario sin variaciones.' };
  }

  return { valid: true };
}

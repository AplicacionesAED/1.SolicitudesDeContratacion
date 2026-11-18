// Generador de claves aleatorias. Ya no hay login por contraseña (2026-11-18): solo se usa para llenar la columna
// hashed_password (NOT NULL) al crear un usuario con una clave que nadie conoce.
const crypto = require('crypto');

// Sin I/O/0/1 (ambiguos al leerlos en voz alta o a mano): la contrasena
// temporal la transcribe un admin a la persona. Mismo generador que el HRMS.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%&*?';
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

function randomChar(charset) {
  return charset[crypto.randomInt(charset.length)];
}

// Genera una clave aleatoria con mayuscula, minuscula, numero y caracter especial. Nunca se guarda en texto plano.
function generateRandomPassword() {
  const obligatorios = [randomChar(UPPER), randomChar(LOWER), randomChar(DIGITS), randomChar(SPECIAL)];
  const resto = Array.from({ length: 8 }, () => randomChar(ALL));
  const chars = [...obligatorios, ...resto];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { generateRandomPassword };

/**
 * Transaction PIN helpers — bcrypt at rest, same 4-digit API for the app.
 * Supports lazy upgrade: plaintext → hash on successful verify.
 */
import bcryptjs from 'bcryptjs';
import { prisma } from './prisma';

const PIN_ROUNDS = 10;
const PLAIN_PIN_RE = /^\d{4}$/;

export function isPinHashed(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return (
    stored.startsWith('$2a$') ||
    stored.startsWith('$2b$') ||
    stored.startsWith('$2y$')
  );
}

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && PLAIN_PIN_RE.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  return bcryptjs.hash(pin, PIN_ROUNDS);
}

/**
 * Compare submitted PIN to stored value.
 * If stored is still plaintext and matches, rehash and persist (lazy migrate).
 */
export async function verifyAndMaybeUpgradePin(
  userId: number,
  storedPin: string | null | undefined,
  submittedPin: string
): Promise<boolean> {
  if (!storedPin || !isValidPinFormat(submittedPin)) {
    return false;
  }

  if (isPinHashed(storedPin)) {
    return bcryptjs.compare(submittedPin, storedPin);
  }

  // Legacy plaintext
  if (storedPin !== submittedPin) {
    return false;
  }

  try {
    const hashed = await hashPin(submittedPin);
    await prisma.user.update({
      where: { id: userId },
      data: { pin: hashed },
    });
  } catch (err) {
    console.error('[PIN] lazy upgrade failed for user', userId, err);
    // Still allow this verify — hash will be fixed by batch migrate / next success
  }
  return true;
}

/** Convenience: load user pin and verify (with lazy upgrade). */
export async function verifyUserPin(
  userId: number,
  submittedPin: string
): Promise<{ ok: boolean; pinSet: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pin: true },
  });
  if (!user?.pin) {
    return { ok: false, pinSet: false };
  }
  const ok = await verifyAndMaybeUpgradePin(userId, user.pin, submittedPin);
  return { ok, pinSet: true };
}

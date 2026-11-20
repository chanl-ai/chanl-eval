import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { roomCode } from './config';
import { accounts, seats, type SeatDoc } from './db';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export class RoomError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return ['scrypt', salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function roomCodeMatches(given: string): boolean {
  const expected = roomCode();
  return expected.length > 0 && given.trim().toLowerCase() === expected.toLowerCase();
}

/**
 * Claims the lowest free seat for this email. findOneAndUpdate is atomic per document, so two
 * concurrent signups can never receive the same seat. A seat already held by this email is
 * returned as-is, which makes a retried signup safe.
 */
export async function claimSeat(email: string): Promise<SeatDoc | null> {
  const col = await seats();
  const held = await col.findOne({ assignedTo: email });
  if (held) return held;
  return col.findOneAndUpdate(
    { assignedTo: null },
    { $set: { assignedTo: email } },
    { sort: { seat: 1 }, returnDocument: 'after' },
  );
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  roomCode: string;
}

export async function signup(input: SignupInput) {
  const name = (input.name ?? '').trim();
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';
  if (!name) throw new RoomError('Enter your name', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RoomError('Enter a valid email', 400);
  if (password.length < 8) throw new RoomError('Password must be at least 8 characters', 400);
  if (!roomCodeMatches(input.roomCode ?? '')) throw new RoomError('Room code not recognized', 400);

  const accts = await accounts();
  if (await accts.findOne({ email })) {
    throw new RoomError('An account with this email already exists. Log in instead.', 409);
  }

  const seat = await claimSeat(email);
  if (!seat) throw new RoomError('The room is full. Ask the facilitator for a seat.', 409);

  try {
    await accts.insertOne({
      email,
      name,
      passwordHash: await hashPassword(password),
      seat: seat.seat,
      createdAt: new Date(),
    });
  } catch (err) {
    // Two signups with the same email raced past the findOne above. claimSeat gave both the same
    // seat and the winner keeps it, so the seat is not released here.
    if ((err as { code?: number }).code === 11000) {
      throw new RoomError('An account with this email already exists. Log in instead.', 409);
    }
    await (await seats()).updateOne(
      { seat: seat.seat, assignedTo: email },
      { $set: { assignedTo: null } },
    );
    throw err;
  }
  return { email, name, seat: seat.seat };
}

export async function login(emailRaw: string, password: string) {
  const email = (emailRaw ?? '').trim().toLowerCase();
  const acct = await (await accounts()).findOne({ email });
  if (!acct || !(await verifyPassword(password ?? '', acct.passwordHash))) {
    throw new RoomError('Email or password is wrong', 401);
  }
  return { email: acct.email, name: acct.name, seat: acct.seat };
}

export async function seatFor(seatId: string): Promise<SeatDoc | null> {
  return (await seats()).findOne({ seat: seatId });
}

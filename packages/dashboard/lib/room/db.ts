import { MongoClient, type Collection, type Db } from 'mongodb';
import { roomMongoUri } from './config';

export interface AccountDoc {
  email: string;
  name: string;
  passwordHash: string;
  seat: string;
  createdAt: Date;
}

export interface SeatDoc {
  seat: string;
  /** Seat server base URL including /api/v1. */
  url: string;
  apiKey: string;
  assignedTo: string | null;
}

// Cached on globalThis so dev hot reloads reuse one pool instead of opening a new one per edit.
const g = globalThis as unknown as { __roomDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const uri = roomMongoUri();
  const client = new MongoClient(uri, { maxPoolSize: 20 });
  await client.connect();
  // The database named in the URI wins, so a test room can sit beside the real one; else "room".
  const db = client.db(client.options.dbName && client.options.dbName !== 'test' ? client.options.dbName : 'room');
  // The unique email index is what makes "one account per email" hold under concurrent signups.
  await db.collection<AccountDoc>('accounts').createIndex({ email: 1 }, { unique: true });
  await db.collection<SeatDoc>('seats').createIndex({ seat: 1 }, { unique: true });
  return db;
}

export function roomDb(): Promise<Db> {
  if (!g.__roomDb) {
    g.__roomDb = connect().catch((err) => {
      g.__roomDb = undefined;
      throw err;
    });
  }
  return g.__roomDb;
}

export async function accounts(): Promise<Collection<AccountDoc>> {
  return (await roomDb()).collection<AccountDoc>('accounts');
}

export async function seats(): Promise<Collection<SeatDoc>> {
  return (await roomDb()).collection<SeatDoc>('seats');
}

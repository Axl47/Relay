import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, userPreferences, users } from "../db/schema";

export class UserRepository {
  async countUsers() {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(users);
    return Number(rows[0]?.count ?? 0);
  }

  createUser(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    isAdmin: boolean;
  }) {
    return db
      .insert(users)
      .values(input)
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
      })
      .then((rows) => rows[0]);
  }

  findUserByEmailWithPassword(email: string) {
    return db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  createSession(userId: string, expiresAt: Date) {
    return db
      .insert(sessions)
      .values({
        userId,
        expiresAt,
      })
      .returning({ id: sessions.id })
      .then((rows) => rows[0]);
  }

  deleteSession(sessionId: string) {
    return db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  findSessionUser(sessionId: string) {
    return db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, sessionId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  insertDefaultPreferences(userId: string, value: unknown) {
    return db.insert(userPreferences).values({
      userId,
      value,
    });
  }

  findPreferences(userId: string) {
    return db
      .select({ value: userPreferences.value })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then((rows) => rows[0]?.value ?? null);
  }

  upsertPreferences(userId: string, value: unknown) {
    return db
      .insert(userPreferences)
      .values({
        userId,
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          value,
          updatedAt: new Date(),
        },
      })
      .returning({ value: userPreferences.value })
      .then((rows) => rows[0]?.value ?? null);
  }
}

import type {
  AuthBootstrapInput,
  AuthLoginInput,
  AuthResponse,
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@relay/contracts";
import { hashPassword, verifyPassword } from "../lib/auth";
import { UserRepository } from "../repositories/user-repository";
import { DEFAULT_PREFERENCES, normalizePreferences } from "./provider-runtime";
import type { ProviderService } from "./provider-service";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
};

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly providers: ProviderService,
  ) {}

  bootstrap(input: AuthBootstrapInput): Promise<AuthResponse> {
    return this.doBootstrap(input);
  }

  login(input: AuthLoginInput): Promise<AuthResponse> {
    return this.doLogin(input);
  }

  async logout(sessionId: string): Promise<void> {
    await this.users.deleteSession(sessionId);
  }

  getSessionUser(sessionId?: string | null): Promise<SessionUser | null> {
    return this.doGetSessionUser(sessionId);
  }

  getPreferences(userId: string): Promise<UserPreferences> {
    return this.doGetPreferences(userId);
  }

  updatePreferences(
    userId: string,
    input: UpdateUserPreferencesInput,
  ): Promise<UserPreferences> {
    return this.doUpdatePreferences(userId, input);
  }

  private async doBootstrap(input: AuthBootstrapInput): Promise<AuthResponse> {
    if ((await this.users.countUsers()) > 0) {
      throw Object.assign(new Error("Bootstrap has already been completed"), { statusCode: 409 });
    }

    const user = await this.users.createUser({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName,
      isAdmin: true,
    });

    await this.users.insertDefaultPreferences(user.id, DEFAULT_PREFERENCES);
    await this.providers.ensureProvidersSeeded();
    await this.providers.seedUserProviderConfigs(user.id);

    const session = await this.users.createSession(
      user.id,
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    );

    return {
      user,
      sessionId: session.id,
    };
  }

  private async doLogin(input: AuthLoginInput): Promise<AuthResponse> {
    const user = await this.users.findUserByEmailWithPassword(input.email);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
    }

    const session = await this.users.createSession(
      user.id,
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
      },
      sessionId: session.id,
    };
  }

  private async doGetSessionUser(sessionId?: string | null): Promise<SessionUser | null> {
    if (!sessionId) {
      return null;
    }

    const result = await this.users.findSessionUser(sessionId);
    if (!result || result.expiresAt < new Date()) {
      return null;
    }

    return {
      id: result.id,
      email: result.email,
      displayName: result.displayName,
      isAdmin: result.isAdmin,
    };
  }

  private async doGetPreferences(userId: string): Promise<UserPreferences> {
    const value = await this.users.findPreferences(userId);
    return normalizePreferences((value as Partial<UserPreferences>) ?? DEFAULT_PREFERENCES);
  }

  private async doUpdatePreferences(
    userId: string,
    input: UpdateUserPreferencesInput,
  ): Promise<UserPreferences> {
    const current = await this.doGetPreferences(userId);
    const next = normalizePreferences({
      ...current,
      ...input,
    });

    const value = await this.users.upsertPreferences(userId, next);
    return normalizePreferences((value as Partial<UserPreferences>) ?? next);
  }
}

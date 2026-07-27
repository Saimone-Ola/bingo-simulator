import { z } from 'zod';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_PATTERN,
  LOCALES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './constants';

/**
 * Auth contracts. The client validates with the exact same schemas so the two
 * ends can never drift, but the server re-validates every payload: client-side
 * validation is a UX affordance, not a security boundary.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(254)
  .email();

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

export const displayNameSchema = z
  .string()
  .trim()
  .min(DISPLAY_NAME_MIN_LENGTH)
  .max(DISPLAY_NAME_MAX_LENGTH)
  .regex(DISPLAY_NAME_PATTERN);

export const localeSchema = z.enum(LOCALES);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  locale: localeSchema.optional(),
  /** The player confirms they meet the advised minimum age. */
  ageAcknowledged: z.literal(true),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(4096),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

export const USER_ROLES = ['player', 'moderator', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** The public shape of the signed-in player. Never includes secrets. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  locale: string;
  level: number;
  experience: number;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  refreshToken: string;
}

export interface AuthResponse {
  user: PublicUser;
  tokens: AuthTokens;
  /** Materialised wallet balance at the time of the response. */
  balance: number;
}

/** Claims carried by the access token. Kept minimal on purpose. */
export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  /** Auth session id, so a single device can be revoked. */
  sid: string;
}

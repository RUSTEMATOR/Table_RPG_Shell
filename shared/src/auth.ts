import { z } from 'zod';
import { PIN_LENGTH } from './constants.ts';

export const ROLES = ['gm', 'player', 'table'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const PinSchema = z.string().regex(/^\d{6}$/, 'PIN — ровно 6 цифр');
export const GmPasswordSchema = z.string().min(8).max(200);
export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/);

export const MemberPublicSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  role: RoleSchema,
});
export type MemberPublic = z.infer<typeof MemberPublicSchema>;

export const MeSchema = z.strictObject({
  member: MemberPublicSchema,
  room: z.strictObject({ name: z.string(), code: z.string() }),
});
export type Me = z.infer<typeof MeSchema>;

export const InviteInfoSchema = z.strictObject({
  name: z.string(),
  role: RoleSchema,
  roomName: z.string(),
  needsSecret: z.boolean(),
});
export type InviteInfo = z.infer<typeof InviteInfoSchema>;

export const InviteAcceptSchema = z.strictObject({
  secret: z.string().optional(),
});

export const LoginMembersSchema = z.strictObject({
  roomName: z.string(),
  members: z.array(MemberPublicSchema),
});
export type LoginMembers = z.infer<typeof LoginMembersSchema>;

export const LoginRequestSchema = z.strictObject({
  roomCode: RoomCodeSchema,
  memberId: z.string().min(1).max(64),
  secret: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const GmMemberSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  role: RoleSchema,
  hasSecret: z.boolean(),
  joined: z.boolean(),
  invitePending: z.boolean(),
  inviteExpiresAt: z.number().nullable(),
});
export type GmMember = z.infer<typeof GmMemberSchema>;

export const CreateMemberSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  role: z.enum(['player', 'table']),
});

export const InviteCreatedSchema = z.strictObject({
  memberId: z.string(),
  path: z.string(),
  expiresAt: z.number(),
});
export type InviteCreated = z.infer<typeof InviteCreatedSchema>;

export const ApiErrorSchema = z.strictObject({
  error: z.string(),
  message: z.string().optional(),
  retryAfterSec: z.number().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

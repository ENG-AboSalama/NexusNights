import { z } from 'zod';
import { ID_RE } from '../util/fsx';

export const EMOJIS = ['❤️', '😂', '😮', '😢', '👏', '🔥', '💀', '👀'] as const;

const pos = z.number().finite().min(0).max(1_000_000);

export const Handshake = z.object({
  instanceId: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  accessToken: z.string().max(400).optional(),
  guest: z.object({ id: z.string().regex(/^g-[a-f0-9]{12}$/), name: z.string().max(64) }).optional(),
});

export const Cmd = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), position: pos }),
  z.object({ type: z.literal('pause'), position: pos }),
  z.object({ type: z.literal('seek'), position: pos }),
  z.object({ type: z.literal('select'), mediaId: z.string().min(1).max(100), position: pos.optional() }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('stream:start'), hlsUrl: z.string().max(500) }),
  z.object({ type: z.literal('stream:stop') }),
  z.object({ type: z.literal('subtitle'), subtitleId: z.string().max(200).nullable() }),
  z.object({ type: z.literal('audio'), audioTrack: z.number().int().min(0).max(20) }),
  z.object({ type: z.literal('speed'), playbackRate: z.number().min(0.25).max(2.0) }),
]);
export type Cmd = z.infer<typeof Cmd>;

export const Buffering = z.object({ kind: z.enum(['load', 'stall']), value: z.boolean() });
export const Chat = z.object({ text: z.string().min(1).max(600) });
export const Reaction = z.object({ emoji: z.enum(EMOJIS) });
export const UserRef = z.object({ userId: z.string().min(1).max(40) });
export const Mode = z.object({ mode: z.enum(['host', 'selected', 'everyone']) });

/**
 * User identity shared types
 * Replaces Discord Activity Identity
 */
export interface Identity {
  id: string;
  name: string;
  avatar: string | null;
  guest: boolean;
  privileged: boolean;
}

export const cleanName = (s: unknown, fallback = 'Guest'): string => {
  const t = String(s ?? '').replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return t || fallback;
};

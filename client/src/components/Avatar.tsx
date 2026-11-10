import { useState } from 'react';
import { u } from '../api';
import type { User } from '../auth/AuthContext';

const PALETTE = ['#7a1f2b', '#5b3a6e', '#2f5d6b', '#6b5a2f', '#3f6b46', '#6b3f2f'];

/** Minimal user shape for avatar display */
export interface AvatarUser {
  id?: string;
  userId?: string;
  name?: string;
  username?: string;
  avatar: string | null;
}

/** Discord avatar via OUR proxy (/api/avatar) with a coloured-initial fallback. */
export function Avatar({ user, size = 32, ring = false }: { user: AvatarUser | User; size?: number; ring?: boolean }) {
  const [broken, setBroken] = useState(false);
  const uid = (user as any)?.id || (user as any)?.userId || '';
  const name = user?.name || (user as any)?.username || (user as any)?.globalName || 'User';
  
  // Safe BigInt calculation from numerical characters in ID
  const numStr = uid ? uid.replace(/\D/g, '') : '';
  const color = PALETTE[Number(BigInt(numStr || '0') % BigInt(PALETTE.length))];
  const style = { width: size, height: size };
  const cls = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-crypt ${ring ? 'ring-2 ring-ink' : ''}`;
  
  return user?.avatar && !broken && uid ? (
    <img src={u(`/api/avatar/${uid}/${user.avatar}`)} alt={name} title={name} width={size} height={size} style={style} className={cls} onError={() => setBroken(true)} />
  ) : (
    <span style={{ ...style, background: color, fontSize: size * 0.42 }} className={`${cls} font-semibold text-bone`} title={name}>
      {[...name][0]?.toUpperCase() || '?'}
    </span>
  );
}

export function AvatarStack({ users, max = 4, size = 30 }: { users: (AvatarUser | User)[]; max?: number; size?: number }) {
  const validUsers = (users || []).filter(Boolean);
  const shown = validUsers.slice(0, max);
  const extra = validUsers.length - shown.length;
  return (
    <div className="flex items-center ps-2">
      {shown.map((p, idx) => {
        const key = (p as any)?.id || (p as any)?.userId || idx;
        return (
          <span key={key} className="-ms-2"><Avatar user={p} size={size} ring /></span>
        );
      })}
      {extra > 0 && (
        <span className="-ms-2 inline-flex items-center justify-center rounded-full bg-ash text-[0.7rem] font-semibold ring-2 ring-ink" style={{ width: size, height: size }}>+{extra}</span>
      )}
    </div>
  );
}
import { useState } from 'react';

const PALETTE = [
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-amber-600 text-white',
  'bg-violet-600 text-white',
  'bg-slate-700 text-white',
];

function getInitials(name = '') {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getTone(name = '') {
  const value = String(name ?? '');
  let sum = 0;
  for (let i = 0; i < value.length; i += 1) sum += value.charCodeAt(i);
  return PALETTE[sum % PALETTE.length];
}

export default function Avatar({ user, size = 'md', className = '' }) {
  const [failed, setFailed] = useState(false);

  const sizeMap = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-sm',
  };

  const dims = sizeMap[size] || sizeMap.md;

  if (user?.avatar_url && !failed) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name || 'User avatar'}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${dims} rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700 ${className}`}
      />
    );
  }

  return (
    <span
      title={user?.name}
      className={`${dims} ${getTone(user?.name)} rounded-full inline-flex items-center justify-center font-semibold shrink-0 select-none ${className}`}
    >
      {getInitials(user?.name)}
    </span>
  );
}

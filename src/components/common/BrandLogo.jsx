import React from 'react';
import { BRAND_NAME, TAGLINE } from '../../constants/config';

export default function BrandLogo({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-lg font-black text-white shadow-lg shadow-indigo-500/25">C</div>
      {!compact && <div><p className="font-extrabold tracking-tight text-slate-900">{BRAND_NAME}</p><p className="text-xs text-slate-500">{TAGLINE}</p></div>}
    </div>
  );
}

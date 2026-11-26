import React, { useEffect, useState } from 'react';

interface FallingFloraSpec {
  id: string;
  kind: 'petal' | 'blossom' | 'leaf';
  left: string;
  size: string;
  color: string;
  centerColor?: string;
  duration: string;
  delay: string;
  reverse?: boolean;
  hideOnMobile?: boolean;
}

const SITE_FALLING_FLORA: FallingFloraSpec[] = [
  { id: 'f1', kind: 'petal', left: '3%', size: 'w-4 h-4', color: '#fb7185', duration: '21s', delay: '-2s' },
  { id: 'f2', kind: 'blossom', left: '8%', size: 'w-5 h-5', color: '#fda4af', centerColor: '#fde68a', duration: '25s', delay: '-15s', reverse: true, hideOnMobile: true },
  { id: 'f3', kind: 'leaf', left: '12%', size: 'w-4 h-4', color: '#6ee7b7', duration: '24s', delay: '-9s' },
  { id: 'f4', kind: 'petal', left: '17%', size: 'w-3.5 h-3.5', color: '#f9a8d4', duration: '19s', delay: '-5s', hideOnMobile: true },
  { id: 'f5', kind: 'blossom', left: '22%', size: 'w-4 h-4', color: '#fbcfe8', centerColor: '#fcd34d', duration: '27s', delay: '-19s', reverse: true },
  { id: 'f6', kind: 'petal', left: '27%', size: 'w-4 h-4', color: '#f43f5e', duration: '22s', delay: '-12s', hideOnMobile: true },
  { id: 'f7', kind: 'blossom', left: '32%', size: 'w-5 h-5', color: '#fda4af', centerColor: '#fef08a', duration: '26s', delay: '-3s', reverse: true },
  { id: 'f8', kind: 'leaf', left: '37%', size: 'w-3.5 h-3.5', color: '#34d399', duration: '23s', delay: '-17s', hideOnMobile: true },
  { id: 'f9', kind: 'petal', left: '42%', size: 'w-4 h-4', color: '#f472b6', duration: '20s', delay: '-7s' },
  { id: 'f10', kind: 'blossom', left: '47%', size: 'w-4 h-4', color: '#fecdd3', centerColor: '#fde68a', duration: '28s', delay: '-22s', reverse: true, hideOnMobile: true },
  { id: 'f11', kind: 'petal', left: '52%', size: 'w-3.5 h-3.5', color: '#fb7185', duration: '18s', delay: '-14s' },
  { id: 'f12', kind: 'blossom', left: '57%', size: 'w-5 h-5', color: '#f9a8d4', centerColor: '#fcd34d', duration: '24s', delay: '-6s', reverse: true, hideOnMobile: true },
  { id: 'f13', kind: 'leaf', left: '62%', size: 'w-4 h-4', color: '#6ee7b7', duration: '25s', delay: '-18s' },
  { id: 'f14', kind: 'petal', left: '66%', size: 'w-4 h-4', color: '#fda4af', duration: '21s', delay: '-1s', hideOnMobile: true },
  { id: 'f15', kind: 'blossom', left: '71%', size: 'w-5 h-5', color: '#f472b6', centerColor: '#fef08a', duration: '24s', delay: '-13s', reverse: true },
  { id: 'f16', kind: 'petal', left: '76%', size: 'w-3.5 h-3.5', color: '#fbcfe8', duration: '19s', delay: '-10s', hideOnMobile: true },
  { id: 'f17', kind: 'blossom', left: '81%', size: 'w-4 h-4', color: '#fb7185', centerColor: '#fde68a', duration: '26s', delay: '-20s', reverse: true },
  { id: 'f18', kind: 'leaf', left: '85%', size: 'w-3.5 h-3.5', color: '#34d399', duration: '22s', delay: '-4s', hideOnMobile: true },
  { id: 'f19', kind: 'petal', left: '89%', size: 'w-4 h-4', color: '#fda4af', duration: '20s', delay: '-8s' },
  { id: 'f20', kind: 'blossom', left: '93%', size: 'w-4 h-4', color: '#fecdd3', centerColor: '#fde68a', duration: '26s', delay: '-16s', reverse: true },
  { id: 'f21', kind: 'petal', left: '96%', size: 'w-3.5 h-3.5', color: '#f9a8d4', duration: '23s', delay: '-11s', hideOnMobile: true },
  { id: 'f22', kind: 'blossom', left: '19%', size: 'w-4 h-4', color: '#fda4af', centerColor: '#fef08a', duration: '29s', delay: '-24s', reverse: true, hideOnMobile: true },
];

export const AmbientDecorations: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none">
      {/* Multi-color luminous gradient canvas (Light & Dark) */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FFF9FC] via-[#FAF7FF] to-[#F3FDFF] dark:from-[#0B0918] dark:via-[#140F2D] dark:to-[#081928] transition-colors duration-300" />

      {/* Drifting soft pastel / cosmic aurora blobs */}
      <div className="animate-aurora absolute -top-28 -right-24 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-pink-300/35 via-rose-200/30 to-amber-200/25 dark:from-pink-600/22 dark:via-fuchsia-600/18 dark:to-amber-500/12 blur-3xl" />
      <div className="animate-aurora-slow absolute top-1/4 -left-24 w-[440px] h-[440px] rounded-full bg-gradient-to-tr from-cyan-300/30 via-sky-200/25 to-emerald-200/25 dark:from-cyan-500/20 dark:via-sky-600/16 dark:to-emerald-500/14 blur-3xl" />
      <div className="animate-aurora absolute -bottom-24 right-1/4 w-[500px] h-[420px] rounded-full bg-gradient-to-tr from-purple-300/30 via-fuchsia-200/25 to-orange-200/25 dark:from-purple-600/22 dark:via-violet-600/18 dark:to-rose-500/12 blur-3xl" />

      {/* Subtle translucent flowers, rose petals & botanical leaves drifting slowly across the site */}
      {SITE_FALLING_FLORA.map((item) => {
        const animClass = item.reverse ? 'animate-global-petal-reverse' : 'animate-global-petal';
        const visibilityClass = item.hideOnMobile ? 'hidden sm:block' : 'block';
        return (
          <div
            key={item.id}
            aria-hidden="true"
            className={`${visibilityClass} ${animClass} absolute top-0 ${item.size}`}
            style={{
              left: item.left,
              animationDuration: item.duration,
              animationDelay: item.delay,
            }}
          >
            {item.kind === 'petal' ? (
              <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
                <path
                  d="M16 3C22 6 27 13 24 21C22 26 17 29 12 27C7 25 5 18 8 11C10 6 13 4 16 3Z"
                  fill={item.color}
                  fillOpacity="0.65"
                />
              </svg>
            ) : item.kind === 'leaf' ? (
              <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
                <path
                  d="M25 5C15 6 7 14 7 25C18 25 26 17 25 5Z"
                  fill={item.color}
                  fillOpacity="0.52"
                />
                <path
                  d="M9 23C13 18 18 13 23 8"
                  stroke="#ffffff"
                  strokeOpacity="0.45"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 36 36" fill="none" className="w-full h-full">
                <circle cx="18" cy="10" r="5" fill={item.color} fillOpacity="0.6" />
                <circle cx="26" cy="16" r="5" fill={item.color} fillOpacity="0.55" />
                <circle cx="23" cy="25" r="5" fill={item.color} fillOpacity="0.6" />
                <circle cx="13" cy="25" r="5" fill={item.color} fillOpacity="0.55" />
                <circle cx="10" cy="16" r="5" fill={item.color} fillOpacity="0.6" />
                <circle cx="18" cy="18" r="3" fill={item.centerColor || '#fde68a'} fillOpacity="0.75" />
              </svg>
            )}
          </div>
        );
      })}

      {/* Subtle artistic SVG celestial & botanical accents */}
      <svg
        className="animate-float-gentle absolute top-20 left-10 w-16 h-16 text-pink-400/25 dark:text-pink-400/35 hidden lg:block"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M32 10C36 22 42 28 54 32C42 36 36 42 32 54C28 42 22 36 10 32C22 28 28 22 32 10Z"
          fill="currentColor"
        />
      </svg>

      <svg
        className="animate-float-gentle absolute bottom-24 left-16 w-20 h-20 text-purple-400/20 dark:text-purple-400/30 hidden lg:block"
        style={{ animationDelay: '1.8s' }}
        viewBox="0 0 80 80"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="40" cy="40" r="16" stroke="currentColor" strokeWidth="2.5" />
        <ellipse
          cx="40"
          cy="40"
          rx="32"
          ry="10"
          transform="rotate(-22 40 40)"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>

      <svg
        className="animate-float-gentle absolute top-40 right-8 w-14 h-14 text-cyan-400/25 dark:text-cyan-400/35 hidden xl:block"
        style={{ animationDelay: '3s' }}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M42 12C31 14 23 24 23 35C23 47 33 56 45 55C34 59 20 53 15 41C10 29 16 15 28 10C33 8 38 9 42 12Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
};

interface AvatarImageProps {
  src?: string;
  name: string;
  sizeClass?: string;
  ringClass?: string;
}

export const AvatarImage: React.FC<AvatarImageProps> = ({
  src,
  name,
  sizeClass = 'w-12 h-12',
  ringClass = 'ring-2 ring-pink-300/80',
}) => {
  const [failed, setFailed] = useState(false);
  const initial = (name || 'ط').trim().charAt(0).toUpperCase();

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`${sizeClass} ${ringClass} rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 text-white font-display font-bold flex items-center justify-center shrink-0 shadow-md`}
        aria-label={name}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} ${ringClass} rounded-2xl object-cover shrink-0 shadow-md bg-pink-50`}
    />
  );
};

/**
 * Design tokens — single source of truth for the C+A design system
 * ("拼多多原生活力 + Stripe 克制").
 *
 * C provides the personality: red-orange gradient brand, large rounded corners,
 * soft tinted stat cards, friendly rounded type.
 * A provides the restraint: generous whitespace, clean hierarchy, accent used
 * sparingly, data shown confidently.
 *
 * Use these instead of hardcoding hex/radius values across pages.
 */

export const tokens = {
  // Brand
  red: '#E53E3E',
  orange: '#FF7849',
  gradient: 'linear-gradient(120deg, #E53E3E 0%, #FF7849 100%)',
  gradientWarm: 'linear-gradient(135deg, #FFB36B, #FF7849)',

  // Ink / text
  ink: '#2B2533',
  inkSoft: '#7A7387',
  inkFaint: '#B6B0C0',

  // Surfaces
  bg: '#F6F5F9',          // app background
  surface: '#FFFFFF',     // cards
  surfaceSoft: '#FAF9FC', // nested/subtle panels
  line: '#F0EEF4',        // borders/dividers

  // Status
  green: '#2FAF56',
  greenBg: '#EAFAEF',
  amber: '#E09112',
  amberBg: '#FFF5E6',
  blue: '#3B82D6',
  blueBg: '#EEF4FD',

  // Radius (C uses large rounded corners)
  radiusSm: 8,
  radius: 13,
  radiusLg: 16,
  radiusXl: 18,

  // Tinted stat-card palettes (soft bg + icon bg + accent)
  cards: {
    pink: { bg: '#FFF0F1', iconBg: '#FFDCDE', accent: '#E53E3E' },
    orange: { bg: '#FFF4EC', iconBg: '#FFE1CD', accent: '#F2762E' },
    green: { bg: '#EEFAF0', iconBg: '#D3F2D9', accent: '#2FAF56' },
    blue: { bg: '#EEF4FD', iconBg: '#D6E6FB', accent: '#3B82D6' },
  },

  // Scene pill colors (售前/售中/售后)
  scene: {
    presale: { bg: '#E6F0FE', color: '#3B82D6' },
    insale: { bg: '#FFF0E0', color: '#E0851E' },
    aftersale: { bg: '#EAFAEF', color: '#2FAF56' },
  },

  shadowBrand: '0 6px 16px rgba(229,62,62,0.30)',
  shadowHero: '0 14px 34px rgba(255,120,73,0.34)',
  shadowCard: '0 2px 8px rgba(43,37,51,0.04)',

  fontFamily: "'Nunito', 'Noto Sans SC', -apple-system, system-ui, sans-serif",
} as const;

export const sceneLabels: Record<string, string> = {
  presale: '售前',
  insale: '售中',
  aftersale: '售后',
};

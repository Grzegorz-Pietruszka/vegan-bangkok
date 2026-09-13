const light = {
  bg:                '#FDF9EE',   // cream screen bg (confirmed)
  surface:           '#FFFFFF',   // cards, pills, inputs
  primary:           '#1B5E3B',   // deep green (confirmed)
  onPrimary:         '#FDF9EE',
  brandGreen:        '#1B5E3B',   // fixed both modes — big green hero surfaces
  onBrand:           '#FDF9EE',   // fixed both modes — text on brandGreen
  onBrandDim:        '#8FD694',   // fixed both modes — secondary text on brandGreen
  verifiedPillBg:    '#E4F1E7',   // "Verified by our team" (confirmed)
  verifiedPillText:  '#1B5E3B',
  communityPillBg:   '#FFF4D6',   // "Loved by users" (confirmed)
  communityPillText: '#9A7100',
  neutralPillBg:     '#F0EADA',   // neutral tag/stamp surfaces
  neutralPillText:   '#6E6450',
  coachBg:           '#EDF5EE',   // "how to order" coach card
  coachBorder:       '#D4E6D8',
  coachText:         '#234A32',
  okText:            '#2E7D32',   // open-now / verified green
  text:              '#232323',   // TODO confirm neutrals against handoff
  textSoft:          '#4A463C',   // long-form body copy
  textMuted:         '#757575',
  border:            '#EDE4CE',
  stampEmptyBorder:  '#CFC5A8',
  white:             '#FFFFFF',   // always white — text/icons over photos & green heroes
  warnBg:            '#FBEFE8',   // warning surface — scan warn cards, error toasts
  warnBorder:        '#EAC8B0',
  warnText:          '#8A4B21',
} as const;

// Warm near-black night palette — same hue family as the cream brand.
const dark: Colors = {
  bg:                '#141410',
  surface:           '#1E1D17',
  primary:           '#4DA875',   // brand green lightened for dark-bg contrast
  onPrimary:         '#0E2A1B',
  brandGreen:        '#1B5E3B',
  onBrand:           '#FDF9EE',
  onBrandDim:        '#8FD694',
  verifiedPillBg:    '#1D3527',
  verifiedPillText:  '#9AD8B0',
  communityPillBg:   '#3A3110',
  communityPillText: '#E0BE5D',
  neutralPillBg:     '#2A2820',
  neutralPillText:   '#A9A492',
  coachBg:           '#1B2B20',
  coachBorder:       '#2E4534',
  coachText:         '#BFE3C8',
  okText:            '#7CC98A',
  text:              '#ECEAE2',
  textSoft:          '#C9C6BB',
  textMuted:         '#99968C',
  border:            '#2D2B22',
  stampEmptyBorder:  '#3A382C',
  white:             '#FFFFFF',
  warnBg:            '#33241B',
  warnBorder:        '#56402E',
  warnText:          '#E2A278',
};

export type Colors = { [K in keyof typeof light]: string };
export const themes = { light: light as Colors, dark };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii   = { sm: 9, md: 14, lg: 18, xl: 22, pill: 999 } as const;

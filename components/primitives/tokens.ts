// Sessions brand tokens.
// @source CLAUDE.md §0 — black, white, grape #8517b5, Farmacia (display), ABCDiatype (body).
// Font files not bundled here; system stacks provide a close fallback until brand .woff2 files are dropped into /public/fonts.

export const colors = {
  black: '#000000',
  white: '#ffffff',
  grape: '#8517b5',
  grapeDeep: '#5e0d83',
  grapeSoft: '#f4e8fb',
  ink: '#0d0d0d',
  ink70: '#404040',
  ink50: '#737373',
  ink30: '#bdbdbd',
  ink10: '#ededed',
  ink05: '#f6f6f6',
  bg: '#fafafa',
  border: '#e5e5e5',
  red: '#c81e1e',
  redSoft: '#fde8e8',
  amber: '#b45309',
  amberSoft: '#fef3c7',
  green: '#166534',
  greenSoft: '#dcfce7',
  blue: '#1e40af',
  blueSoft: '#dbeafe',
} as const;

export const fonts = {
  display: '"Farmacia", "Times New Roman", Georgia, serif',
  body: '"ABCDiatype", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Code", monospace',
} as const;

export const space = {
  px: '1px',
  '0_5': '2px',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px',
} as const;

export const radii = {
  sm: '4px',
  md: '6px',
  lg: '10px',
  pill: '999px',
} as const;

export const text = {
  xs: '11px',
  sm: '12px',
  base: '14px',
  md: '15px',
  lg: '17px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.04)',
  md: '0 2px 8px rgba(0,0,0,0.08)',
  panel: '-12px 0 32px rgba(0,0,0,0.08)',
} as const;

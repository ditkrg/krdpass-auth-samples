export interface ThemeColors {
  primary: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  textPrimary: string;
  textCaption: string;
  border: string;
  error: string;
  errorContainer: string;
  success: string;
  successContainer: string;
  primaryContainer: string;
}

export const LightTheme: ThemeColors = {
  primary: '#00AAFF',
  background: '#FFFFFF',
  surface: '#F1FAFF',
  surfaceVariant: '#F0F0F0',
  textPrimary: '#1E1E1E',
  textCaption: '#5F6368',
  border: '#E6EAEE',
  error: '#FF001D',
  errorContainer: '#FFE5E5',
  success: '#00CE2A',
  successContainer: '#E5FAE5',
  primaryContainer: '#DDF4FF',
};

export const DarkTheme: ThemeColors = {
  primary: '#00AAFF',
  background: '#121212',
  surface: '#1E1E1E',
  surfaceVariant: '#2C2C2E',
  textPrimary: '#FFFFFF',
  textCaption: '#B8BDC4',
  border: '#252526',
  error: '#FF001D',
  errorContainer: '#3E1C1C',
  success: '#00CE2A',
  successContainer: '#1C3E1C',
  primaryContainer: '#16303D',
};

export const UI = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    control: 12,
    card: 16,
    feature: 24,
  },
  size: {
    compactControl: 44,
    touchTarget: 48,
    control: 52,
    avatar: 56,
    logo: 72,
  },
  type: {
    caption: 12,
    body: 14,
    section: 16,
    cardTitle: 18,
    screenTitle: 24,
    brandTitle: 28,
  },
} as const;

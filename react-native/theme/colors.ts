const PALETTE = {
  krdpassBlue: '#00AAFF',
  krdpassLightBlue: '#F1FAFF',
  krdpassDarkText: '#1E1E1E',
  krdpassError: '#FF001D',
  krdpassSuccess: '#00CE2A',

  white: '#FFFFFF',
  black: '#000000',
  darkGrey: '#121212',
  midGrey: '#1E1E1E',
  lightGrey: '#F0F0F0',
  greyText: '#666666',
  captionText: '#5F6368',
  border: '#E6EAEE',
  darkBorder: '#252526',

  errorContainer: '#FFE5E5',
  errorContainerDark: '#3E1C1C',
  successContainer: '#E5FAE5',
  successContainerDark: '#1C3E1C',
};

export const LightColors = {
  primary: PALETTE.krdpassBlue,
  background: PALETTE.white,
  surface: PALETTE.krdpassLightBlue,
  surfaceVariant: PALETTE.lightGrey,
  textPrimary: PALETTE.krdpassDarkText,
  textSecondary: PALETTE.greyText,
  textCaption: PALETTE.captionText,
  border: PALETTE.border,
  error: PALETTE.krdpassError,
  success: PALETTE.krdpassSuccess,

  errorContainer: PALETTE.errorContainer,
  successContainer: PALETTE.successContainer,

  btnSecondaryBg: '#DDF4FF',
  btnSecondaryText: PALETTE.krdpassBlue,
  btnTertiaryBg: PALETTE.successContainer,
  btnTertiaryText: PALETTE.krdpassSuccess,
  btnDangerBg: PALETTE.errorContainer,
  btnDangerText: PALETTE.krdpassError,
};

export const DarkColors = {
  primary: PALETTE.krdpassBlue,
  background: PALETTE.darkGrey,
  surface: PALETTE.midGrey,
  surfaceVariant: '#2C2C2E',
  textPrimary: '#FFFFFF',
  textSecondary: '#AAAAAA',
  textCaption: '#B8BDC4',
  border: PALETTE.darkBorder,
  error: PALETTE.krdpassError,
  success: PALETTE.krdpassSuccess,

  errorContainer: PALETTE.errorContainerDark,
  successContainer: PALETTE.successContainerDark,

  btnSecondaryBg: '#16303D',
  btnSecondaryText: PALETTE.krdpassBlue,
  btnTertiaryBg: PALETTE.successContainerDark,
  btnTertiaryText: PALETTE.krdpassSuccess,
  btnDangerBg: PALETTE.errorContainerDark,
  btnDangerText: PALETTE.krdpassError,
};

export type ThemeColors = typeof LightColors;

export const COLORS = LightColors;

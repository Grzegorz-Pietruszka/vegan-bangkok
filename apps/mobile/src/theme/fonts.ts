import { Platform } from 'react-native';
const pick = (android: string, ios: string) =>
  Platform.select({ android, ios, default: android }) as string;

export const poppins = {
  regular: pick('Poppins_400Regular', 'Poppins-Regular'),
  medium: pick('Poppins_500Medium', 'Poppins-Medium'),
  semibold: pick('Poppins_600SemiBold', 'Poppins-SemiBold'),
  bold: pick('Poppins_700Bold', 'Poppins-Bold'),
} as const;
export const notoThai = {
  regular: pick('NotoSansThai_400Regular', 'NotoSansThai-Regular'),
  medium: pick('NotoSansThai_500Medium', 'NotoSansThai-Medium'),
  semibold: pick('NotoSansThai_600SemiBold', 'NotoSansThai-SemiBold'),
  bold: pick('NotoSansThai_700Bold', 'NotoSansThai-Bold'),
} as const;

import { Text, type TextProps } from 'react-native';
import { typography, type TypeVariant, type Script } from '@/theme/typography';
import { useColors } from '@/theme/useTheme';

type Props = TextProps & { variant?: TypeVariant; script?: Script; color?: string };
export function ThemedText({ variant = 'body', script = 'latin', color, style, ...rest }: Props) {
  const colors = useColors();
  return <Text {...rest} style={[typography(variant, script), { color: color ?? colors.text }, style]} />;
}
// Vendor card 44px Thai:  <ThemedText variant="vendorNameThai" script="thai">{vendor.nameThai}</ThemedText>

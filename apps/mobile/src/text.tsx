import { createContext, useContext } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { DARK } from '@jax/shared';

/**
 * D79: the app typeface is Plus Jakarta Sans (free, Open Font License). Custom fonts on
 * phones come as one file per weight, so this picks the file from `fontWeight` and turns
 * off the phone's fake bolding. Use this `Text` (and `TextInput`) instead of React
 * Native's everywhere in the app.
 */
export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
  /** D120: the JaxSide name in the top bar only (Russo One, free, Open Font License). */
  brand: 'RussoOne_400Regular',
} as const;

const BY_WEIGHT: Record<string, string> = {
  '100': FONT.regular,
  '200': FONT.regular,
  '300': FONT.regular,
  '400': FONT.regular,
  normal: FONT.regular,
  '500': FONT.medium,
  '600': FONT.semibold,
  '700': FONT.bold,
  bold: FONT.bold,
  '800': FONT.heavy,
  '900': FONT.heavy,
};

const InsideText = createContext(false);

function fontFor(style: TextProps['style'], nested: boolean) {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return null;
  // A nested piece with no weight of its own keeps its parent's font.
  if (nested && flat.fontWeight === undefined) return null;
  return {
    fontFamily: BY_WEIGHT[String(flat.fontWeight ?? '400')] ?? FONT.regular,
    fontWeight: 'normal' as const,
  };
}

export function Text({ style, ...rest }: TextProps) {
  const nested = useContext(InsideText);
  const font = fontFor(style, nested);
  const node = <RNText {...rest} style={[nested ? null : { color: DARK.text }, style, font]} />;
  return nested ? node : <InsideText.Provider value>{node}</InsideText.Provider>;
}

export function TextInput({ style, ...rest }: TextInputProps) {
  return (
    <RNTextInput
      keyboardAppearance="dark"
      selectionColor={DARK.accent}
      cursorColor={DARK.accent}
      placeholderTextColor={DARK.placeholder}
      {...rest}
      style={[{ color: DARK.text }, style, fontFor(style, false)]}
    />
  );
}

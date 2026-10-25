import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { DARK } from '@jax/shared';

/*
 * D127 (art deco, option B "Stepped"): shapes borrowed from the app icon's stepped frame.
 * - DecoBox: a box whose background is drawn as a shape instead of a rounded rectangle:
 *   `chamfer` (all four corners clipped), `chamferTop` (top corners only, for posts) or
 *   `arrow` (pointed ends, for buttons, tabs and pills). Drawn with SVG behind the content,
 *   so it works on any background.
 * - StepEdge: the icon's stepped edge where a black header block meets the page.
 * Kept in one place so the look can be tuned (or removed) without touching every screen.
 */

import { DECO, decoPath, type DecoShape } from './deco-path';

export { DECO, decoPath, type DecoShape };

export function DecoBox({
  shape = 'chamfer',
  cut,
  fill = DARK.card,
  stroke,
  strokeWidth = 1,
  style,
  children,
  ...rest
}: ViewProps & {
  shape?: DecoShape;
  cut?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
    rest.onLayout?.(e);
  };
  const c = cut ?? (shape === 'arrow' ? DECO.point : DECO.cut);
  // The shape replaces the box's own background, border and rounding.
  const flat = StyleSheet.flatten(style) ?? {};
  const {
    backgroundColor: _bg,
    borderRadius: _r,
    borderWidth: _bw,
    borderColor: _bc,
    ...box
  } = flat;
  return (
    <View {...rest} style={box} onLayout={onLayout}>
      {size ? (
        <Svg pointerEvents="none" width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Path
            d={decoPath(shape, size.w, size.h, c, stroke ? strokeWidth / 2 : 0)}
            fill={fill}
            stroke={stroke}
            strokeWidth={stroke ? strokeWidth : 0}
            strokeLinejoin="miter"
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/**
 * The icon's stepped edge under a black block: full width, then two steps down to a
 * centered tab (drawn in a 100 × 10 box, stretched to the screen width).
 */
export function StepEdge({ color = DARK.bar, height = 10 }: { color?: string; height?: number }) {
  return (
    <Svg
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      width="100%"
      height={height}
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
    >
      <Path d="M0 0 H100 V3.5 H86 V6.8 H72 V10 H28 V6.8 H14 V3.5 H0 Z" fill={color} />
    </Svg>
  );
}

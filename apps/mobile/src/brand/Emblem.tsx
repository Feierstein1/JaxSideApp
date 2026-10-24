import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import { DARK, EMBLEM } from '@jax/shared';
import { FONT, Text } from '@/text';

/*
 * P15.4: the app icon (assets/brand/icon-emblem.svg) drawn with shapes, so the loading
 * screen can animate its parts (D121): the stepped frame draws itself, the skyline fades in,
 * the building's fins light up one by one, and the JAXSIDE name fills in from the left.
 * Geometry is copied from the SVG (1024 x 1024 viewBox); keep the two in step.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const FRAME =
  'M152 900 V380 H208 V316 H264 V252 H320 V188 H704 V252 H760 V316 H816 V380 H872 V900 Z';
/** Length of FRAME's outline (for drawing it in). */
const FRAME_LENGTH = 2880;
const RAYS =
  'M512 800 L-388 800 L-368 613 Z M512 800 L-310 434 L-216 271 Z M512 800 L-90 131 L62 21 Z M512 800 L234 -56 L418 -95 Z M512 800 L606 -95 L790 -56 Z M512 800 L962 21 L1114 131 Z M512 800 L1240 271 L1334 434 Z M512 800 L1392 613 L1412 800 Z';
const FINS = [458, 478, 498, 518, 538, 558];

interface Progress {
  /** 0 → 1: the frame outline draws itself. */
  frame: Animated.Value | number;
  /** 0 → 1: everything inside the frame fades in. */
  scene: Animated.Value | number;
  /** One value per fin, 0 (normal) → 1 (lit). */
  fins: (Animated.Value | number)[];
}

function EmblemArt({ size, progress }: { size: number; progress: Progress }) {
  const dash =
    typeof progress.frame === 'number'
      ? FRAME_LENGTH * (1 - progress.frame)
      : progress.frame.interpolate({ inputRange: [0, 1], outputRange: [FRAME_LENGTH, 0] });
  const finColor = (v: Animated.Value | number) =>
    typeof v === 'number'
      ? EMBLEM.fin
      : v.interpolate({ inputRange: [0, 1], outputRange: [EMBLEM.fin, DARK.accent] });
  const finWidth = (v: Animated.Value | number) =>
    typeof v === 'number' ? 4 : v.interpolate({ inputRange: [0, 1], outputRange: [4, 9] });
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <ClipPath id="emblemFrame">
          <Path d={FRAME} />
        </ClipPath>
      </Defs>
      <Rect width={1024} height={1024} fill={EMBLEM.navy} />
      <AnimatedG opacity={progress.scene} clipPath="url(#emblemFrame)">
        <Rect width={1024} height={1024} fill={EMBLEM.panel} />
        <Path d={RAYS} fill={EMBLEM.ray} />
        <Path
          d="M172 880 V400 H228 V336 H284 V272 H340 V208 H684 V272 H740 V336 H796 V400 H852 V880 Z"
          fill="none"
          stroke={EMBLEM.bridge}
          strokeWidth={4}
        />
        <G fill="none" stroke={EMBLEM.bridge} strokeWidth={12} strokeLinejoin="round">
          <Path d="M260 600 Q 512 470 764 600" />
          <Path d="M260 620 L302 580 L344 620 L386 551 L428 620 L470 537 L512 620 L554 537 L596 620 L638 551 L680 620 L722 580 L764 620" />
          <Rect x={208} y={488} width={52} height={312} />
          <Rect x={764} y={488} width={52} height={312} />
          <Path d="M208 488 L260 588 M260 488 L208 588" />
          <Path d="M764 488 L816 588 M816 488 L764 588" />
          <Path d="M208 660 L260 730 M260 660 L208 730" />
          <Path d="M764 660 L816 730 M816 660 L764 730" />
        </G>
        <Rect x={152} y={620} width={720} height={18} fill={EMBLEM.bridge} />
        <Rect x={200} y={376} width={68} height={114} fill={EMBLEM.bridge} />
        <Rect x={756} y={376} width={68} height={114} fill={EMBLEM.bridge} />
        <G fill={EMBLEM.panel}>
          {[211, 229, 247, 767, 785, 803].map((x) => (
            <Rect key={x} x={x} y={394} width={10} height={52} />
          ))}
        </G>
        <Rect x={192} y={362} width={84} height={16} fill={EMBLEM.bridgeLight} />
        <Rect x={748} y={362} width={84} height={16} fill={EMBLEM.bridgeLight} />
        <Path d="M412 270 H612 V610 L672 760 H352 L412 610 Z" fill={EMBLEM.building} />
        <Path d="M586 330 H612 V610 L672 760 H636 L586 610 Z" fill={EMBLEM.buildingShade} />
        <Rect x={438} y={330} width={148} height={280} fill={EMBLEM.curtain} />
        {FINS.map((x, i) => (
          <AnimatedLine
            key={x}
            x1={x}
            y1={330}
            x2={x}
            y2={610}
            stroke={finColor(progress.fins[i] ?? 0)}
            strokeWidth={finWidth(progress.fins[i] ?? 0)}
          />
        ))}
        <Path d="M438 610 H586 L636 760 H388 Z" fill={EMBLEM.base} />
        <G stroke={EMBLEM.baseLine} strokeWidth={4}>
          <Line x1={476} y1={610} x2={452} y2={760} />
          <Line x1={512} y1={610} x2={512} y2={760} />
          <Line x1={548} y1={610} x2={572} y2={760} />
          <Line x1={420} y1={690} x2={604} y2={690} />
        </G>
        <G stroke={EMBLEM.panel} strokeWidth={6}>
          <Line x1={428} y1={290} x2={596} y2={290} />
          <Line x1={428} y1={312} x2={596} y2={312} />
        </G>
        <Line
          x1={512}
          y1={270}
          x2={512}
          y2={222}
          stroke={EMBLEM.building}
          strokeWidth={8}
          strokeLinecap="round"
        />
        <Rect x={0} y={798} width={1024} height={226} fill={EMBLEM.navy} />
        <G fill={EMBLEM.water}>
          <Rect x={152} y={820} width={720} height={8} />
          <Rect x={232} y={846} width={560} height={8} />
          <Rect x={332} y={872} width={360} height={8} />
        </G>
        <G fill={EMBLEM.building} opacity={0.3}>
          <Rect x={440} y={808} width={14} height={30} />
          <Rect x={474} y={808} width={14} height={44} />
          <Rect x={508} y={808} width={14} height={56} />
          <Rect x={542} y={808} width={14} height={44} />
          <Rect x={576} y={808} width={14} height={30} />
        </G>
        <G fill={EMBLEM.bridge} opacity={0.5}>
          <Rect x={222} y={808} width={24} height={48} />
          <Rect x={778} y={808} width={24} height={48} />
        </G>
      </AnimatedG>
      <AnimatedPath
        d={FRAME}
        fill="none"
        stroke={EMBLEM.building}
        strokeWidth={12}
        strokeLinejoin="miter"
        strokeDasharray={[FRAME_LENGTH, FRAME_LENGTH]}
        strokeDashoffset={dash}
      />
      <AnimatedG opacity={progress.scene}>
        <Path d="M512 932 L536 956 L512 980 L488 956 Z" fill={EMBLEM.building} />
        <Rect x={392} y={952} width={72} height={8} fill={EMBLEM.building} />
        <Rect x={560} y={952} width={72} height={8} fill={EMBLEM.building} />
      </AnimatedG>
    </Svg>
  );
}

/** The finished emblem, still (the sign-in header, D121). */
export function Emblem({ size }: { size: number }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="JaxSide"
      style={{ width: size, height: size, borderRadius: size * 0.22, overflow: 'hidden' }}
    >
      <EmblemArt size={size} progress={{ frame: 1, scene: 1, fins: FINS.map(() => 0) }} />
    </View>
  );
}

/** The JAXSIDE name; `fill` 0 → 1 colors it in from the left over a dim copy. */
export function Wordmark({ fontSize, fill }: { fontSize: number; fill: Animated.Value | number }) {
  const [width, setWidth] = useState(0);
  const name = (dim: boolean) => (
    <Text style={{ fontFamily: FONT.brand, fontSize, lineHeight: fontSize * 1.2 }}>
      <Text style={{ color: dim ? DARK.raised : DARK.accent }}>JAX</Text>
      <Text style={{ color: dim ? DARK.raised : DARK.text }}>SIDE</Text>
    </Text>
  );
  const shown =
    typeof fill === 'number'
      ? width * fill
      : fill.interpolate({ inputRange: [0, 1], outputRange: [0, width] });
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {name(true)}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: shown,
          overflow: 'hidden',
        }}
      >
        <View style={{ width }}>{name(false)}</View>
      </Animated.View>
    </View>
  );
}

/**
 * D121: the loading screen's animated emblem and name. Plays once (frame, skyline, name),
 * then the fins keep lighting up in turn while loading continues. With "reduce motion" on
 * it shows the finished emblem, still.
 */
export function LoadingEmblem({ size = 120 }: { size?: number }) {
  const frame = useRef(new Animated.Value(0)).current;
  const scene = useRef(new Animated.Value(0)).current;
  const name = useRef(new Animated.Value(0)).current;
  const fins = useRef(FINS.map(() => new Animated.Value(0))).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return setStill(true);
      const ease = Easing.inOut(Easing.cubic);
      // SVG properties can't use the native driver.
      const to = (v: Animated.Value, value: number, duration: number) =>
        Animated.timing(v, { toValue: value, duration, easing: ease, useNativeDriver: false });
      const lights = Animated.stagger(
        130,
        fins.map((f) => Animated.sequence([to(f, 1, 260), to(f, 0, 420)])),
      );
      loop = Animated.sequence([
        to(frame, 1, 1100),
        Animated.parallel([to(scene, 1, 600), to(name, 1, 900)]),
        Animated.loop(Animated.sequence([lights, Animated.delay(500)])),
      ]);
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [frame, scene, name, fins]);

  const progress: Progress = still
    ? { frame: 1, scene: 1, fins: FINS.map(() => 0) }
    : { frame, scene, fins };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="JaxSide, loading"
      style={{ alignItems: 'center', gap: 18 }}
    >
      <View style={{ width: size, height: size, borderRadius: size * 0.22, overflow: 'hidden' }}>
        <EmblemArt size={size} progress={progress} />
      </View>
      <Wordmark fontSize={Math.round(size * 0.3)} fill={still ? 1 : name} />
    </View>
  );
}

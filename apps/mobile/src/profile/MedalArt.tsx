import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';
import { MEDAL, MEDAL_METALS, MEDAL_TIER_NAMES } from '@jax/shared';

/**
 * D95 / D122: medal artwork. Each medal has its own shape, so they can be told apart at
 * 16 px and without color; the level (Bronze, Silver, Gold, Platinum) sets the metal:
 * - first_contribution: round coin, speech bubble with a spark
 * - well_received: laurel rosette, up arrow and five dots (the posts)
 * - approved_contributor: hexagon, map pin with a check
 * - helpful_commenter: shield, heart
 * - place_verifier: diamond, check mark
 * - neighborhood_explorer: eight-point star (the icon's sunburst), compass
 * - longtime_neighbor: arch (a doorway), house
 * `MedalArt` is the full medal with ribbon tails (profiles); `MedalBadge` the simple one
 * next to a name. A medal added later without artwork gets a plain coin with a star.
 * Shapes and symbols are drawn once in a 120 × 120 box; the badge scales them down.
 */

export const MEDAL_NAMES: Record<string, string> = {
  first_contribution: 'First Contribution',
  well_received: 'Well Received',
  approved_contributor: 'Approved Contributor',
  helpful_commenter: 'Helpful Commenter',
  place_verifier: 'Place Verifier',
  neighborhood_explorer: 'Neighborhood Explorer',
  longtime_neighbor: 'Longtime Neighbor',
};

/** "Gold Well Received" (what screen readers say). */
export function medalLabel(key: string, tier: number) {
  return `${MEDAL_TIER_NAMES[tier - 1] ?? 'Bronze'} ${MEDAL_NAMES[key] ?? 'medal'}`;
}

const metal = (tier: number) => MEDAL_METALS[Math.min(Math.max(tier, 1), 4) - 1]!;

const ROSETTE = [
  [60, 10],
  [85, 16.7],
  [103.3, 35],
  [110, 60],
  [103.3, 85],
  [85, 103.3],
  [60, 110],
  [35, 103.3],
  [16.7, 85],
  [10, 60],
  [16.7, 35],
  [35, 16.7],
] as const;

const LEAVES = [
  [35, 76, -60],
  [31.5, 66, -80],
  [31.5, 55, -100],
  [34.5, 45, -120],
  [85, 76, 60],
  [88.5, 66, 80],
  [88.5, 55, 100],
  [85.5, 45, 120],
] as const;

const STAR = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? 46 : 57;
  return `${(60 + r * Math.cos(a)).toFixed(1)},${(60 + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

/** The medal's outline, filled with one color. `ring`: the inner rings (plain for the rosette). */
function Shape({ medalKey, fill, ring }: { medalKey: string; fill: string; ring?: boolean }) {
  switch (medalKey) {
    case 'well_received':
      if (ring) return <Circle cx={60} cy={60} r={52} fill={fill} />;
      return (
        <G fill={fill}>
          <Circle cx={60} cy={60} r={48} />
          {ROSETTE.map(([x, y]) => (
            <Circle key={`${x},${y}`} cx={x} cy={y} r={8} />
          ))}
        </G>
      );
    case 'approved_contributor':
      return <Polygon points="60,4 108.5,32 108.5,88 60,116 11.5,88 11.5,32" fill={fill} />;
    case 'helpful_commenter':
      return (
        <Path d="M60 5 L106 20 V58 C106 86 86 106 60 116 C34 106 14 86 14 58 V20 Z" fill={fill} />
      );
    case 'place_verifier':
      return (
        <Path
          d="M60 4 L116 60 L60 116 L4 60 Z"
          fill={fill}
          strokeLinejoin="round"
          stroke={fill}
          strokeWidth={6}
        />
      );
    case 'neighborhood_explorer':
      return <Polygon points={STAR} fill={fill} />;
    case 'longtime_neighbor':
      return <Path d="M15 114 V58 A45 45 0 0 1 105 58 V114 Z" fill={fill} />;
    default:
      return <Circle cx={60} cy={60} r={53} fill={fill} />;
  }
}

/** `Shape` scaled about the center (1 = full size). */
function Scaled({ s, children }: { s: number; children: ReactNode }) {
  return <G transform={`translate(60 60) scale(${s}) translate(-60 -60)`}>{children}</G>;
}

interface GlyphColors {
  /** Strokes and main symbol parts. */
  line: string;
  /** Highlights in the metal color. */
  accent: string;
  /** Marks cut out of a filled part (e.g. the check on the map pin). */
  cut: string;
  /** Stroke width multiplier (thicker in the small badge). */
  w: number;
}

/** The symbol in the middle of the medal (120 × 120 box). */
function Glyph({ medalKey, c }: { medalKey: string; c: GlyphColors }) {
  const stroke = {
    fill: 'none',
    stroke: c.line,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  switch (medalKey) {
    case 'first_contribution':
      return (
        <>
          <Path
            d="M42 38 h36 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-19 l-11 9 v-9 h-6 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z"
            {...stroke}
            strokeWidth={4.5 * c.w}
          />
          <Path
            d="M60 44 L62.6 51.4 L70 54 L62.6 56.6 L60 64 L57.4 56.6 L50 54 L57.4 51.4 Z"
            fill={c.accent}
          />
        </>
      );
    case 'well_received':
      return (
        <>
          <Path d="M60 76 V40 M46 54 L60 40 L74 54" {...stroke} strokeWidth={5.5 * c.w} />
          {c.w === 1 ? (
            <G fill={c.accent}>
              {[47, 53.5, 60, 66.5, 73].map((x, i) => (
                <Circle key={x} cx={x} cy={[86, 88, 88.7, 88, 86][i]} r={2.3} />
              ))}
            </G>
          ) : null}
        </>
      );
    case 'approved_contributor':
      return (
        <>
          <Path
            d="M60 32 c-11 0 -19 8.5 -19 19 c0 14 19 33 19 33 s19 -19 19 -33 c0 -10.5 -8 -19 -19 -19 z"
            fill={c.accent}
          />
          <Path
            d="M51.5 50.5 l6 6 l11 -12"
            fill="none"
            stroke={c.cut}
            strokeWidth={4.5 * c.w}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'helpful_commenter':
      return (
        <Path
          d="M60 84 C40 71 35 60 35 51 C35 43 41 37 48.5 37 C53.5 37 57.5 40 60 44.5 C62.5 40 66.5 37 71.5 37 C79 37 85 43 85 51 C85 60 80 71 60 84 Z"
          fill={c.accent}
        />
      );
    case 'place_verifier':
      return <Path d="M40 61 L54 75 L81 45" {...stroke} strokeWidth={8 * c.w} />;
    case 'neighborhood_explorer':
      return (
        <>
          <Circle cx={60} cy={60} r={25} {...stroke} strokeWidth={4 * c.w} />
          <Path d="M60 36 L68 60 L52 60 Z" fill={c.accent} />
          <Path d="M60 84 L68 60 L52 60 Z" fill={c.line} />
        </>
      );
    case 'longtime_neighbor':
      return (
        <>
          <Path d="M37 63 L60 42 L83 63 M45 57 V81 H75 V57" {...stroke} strokeWidth={5.5 * c.w} />
          <Rect x={55} y={67} width={10} height={14} rx={1.5} fill={c.accent} />
        </>
      );
    default:
      return (
        <Path
          d="M60 38 L65.5 52 L80 53 L69 62.5 L72.5 77 L60 69 L47.5 77 L51 62.5 L40 53 L54.5 52 Z"
          fill={c.accent}
        />
      );
  }
}

/** The full medal (120 × 150 artwork) in its level's metal, `size` = its width. */
export function MedalArt({
  medalKey,
  tier = 1,
  size = 56,
}: {
  medalKey: string;
  tier?: number;
  size?: number;
}) {
  const m = metal(tier);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${medalLabel(medalKey, tier)} medal`}
    >
      <Svg width={size} height={size * 1.25} viewBox="0 0 120 150">
        <Path d="M42 92 L30 146 L44 136 L52 148 L60 100 Z" fill={m.rim} />
        <Path d="M78 92 L90 146 L76 136 L68 148 L60 100 Z" fill={m.deep} />
        <Shape medalKey={medalKey} fill={m.main} />
        <Scaled s={0.9}>
          <Shape medalKey={medalKey} fill={m.rim} ring />
        </Scaled>
        <Scaled s={0.85}>
          <Shape medalKey={medalKey} fill={m.main} ring />
        </Scaled>
        <Scaled s={0.74}>
          <Shape medalKey={medalKey} fill={MEDAL.face} ring />
        </Scaled>
        {medalKey === 'well_received' ? (
          <G fill={m.main}>
            {LEAVES.map(([x, y, a]) => (
              <Ellipse
                key={`${x},${y}`}
                cx={x}
                cy={y}
                rx={6}
                ry={2.6}
                transform={`rotate(${a} ${x} ${y})`}
              />
            ))}
          </G>
        ) : null}
        <Glyph medalKey={medalKey} c={{ line: MEDAL.glyph, accent: m.main, cut: m.on, w: 1 }} />
      </Svg>
    </View>
  );
}

/**
 * The simple badge (24 × 24) next to a username on posts, comments and profiles: the
 * medal's shape in its metal with a bold dark symbol. Decorative there: the name row
 * announces the medals as text.
 */
export function MedalBadge({
  medalKey,
  tier = 1,
  size = 16,
}: {
  medalKey: string;
  tier?: number;
  size?: number;
}) {
  const m = metal(tier);
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Shape medalKey={medalKey} fill={m.main} />
      <Scaled s={1.2}>
        <Glyph medalKey={medalKey} c={{ line: m.on, accent: m.on, cut: m.main, w: 1.9 }} />
      </Scaled>
    </Svg>
  );
}

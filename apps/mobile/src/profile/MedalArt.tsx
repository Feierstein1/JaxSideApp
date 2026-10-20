import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Polygon } from 'react-native-svg';
import { MEDAL } from '@jax/shared';

/**
 * D95: medal artwork. Each medal has its own shape AND color, so they can be told apart at
 * 16 px and without relying on color:
 * - first_contribution: a round teal coin with a speech bubble and a gold spark;
 * - approved_contributor: a gold hexagon badge with a map pin and a check mark;
 * - well_received: a gold laurel rosette with an up arrow and five dots (five posts).
 * `MedalArt` is the full medal with ribbon tails (profiles); `MedalBadge` the simple one
 * for next to a name. A medal added later without artwork gets a plain ribbon badge.
 */

export const MEDAL_NAMES: Record<string, string> = {
  first_contribution: 'First Contribution',
  approved_contributor: 'Approved Contributor',
  well_received: 'Well Received',
};

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

function Ribbons({ front, back, top = 92 }: { front: string; back: string; top?: number }) {
  return (
    <>
      <Path d={`M42 ${top} L30 146 L44 136 L52 148 L60 ${top + 8} Z`} fill={front} />
      <Path d={`M78 ${top} L90 146 L76 136 L68 148 L60 ${top + 8} Z`} fill={back} />
    </>
  );
}

/** The full medal (120 × 150 artwork), `size` = its width. */
export function MedalArt({ medalKey, size = 56 }: { medalKey: string; size?: number }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${MEDAL_NAMES[medalKey] ?? 'Medal'} medal`}
    >
      <Svg width={size} height={size * 1.25} viewBox="0 0 120 150">
        {medalKey === 'first_contribution' ? (
          <>
            <Ribbons front={MEDAL.teal} back={MEDAL.tealDeep} />
            <Circle cx={60} cy={60} r={52} fill={MEDAL.teal} />
            <Circle
              cx={60}
              cy={60}
              r={47}
              fill="none"
              stroke={MEDAL.tealLine}
              strokeWidth={2}
              strokeDasharray="2 4"
            />
            <Circle cx={60} cy={60} r={40} fill={MEDAL.face} />
            <Path
              d="M27 80 q8.5 -5 17 0 t17 0 t17 0 t17 0"
              fill="none"
              stroke={MEDAL.tealLine}
              strokeOpacity={0.4}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <Path
              d="M42 36 h36 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-19 l-11 9 v-9 h-6 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z"
              fill="none"
              stroke={MEDAL.glyph}
              strokeWidth={4.5}
              strokeLinejoin="round"
            />
            <Path
              d="M60 42 L62.6 49.4 L70 52 L62.6 54.6 L60 62 L57.4 54.6 L50 52 L57.4 49.4 Z"
              fill={MEDAL.gold}
            />
          </>
        ) : medalKey === 'approved_contributor' ? (
          <>
            <Ribbons front={MEDAL.gold} back={MEDAL.oldGold} top={96} />
            <Polygon points="60,6 106.8,33 106.8,87 60,114 13.2,87 13.2,33" fill={MEDAL.gold} />
            <Polygon
              points="60,12 101.6,36 101.6,84 60,108 18.4,84 18.4,36"
              fill="none"
              stroke={MEDAL.oldGold}
              strokeWidth={2}
            />
            <Polygon
              points="60,17 97.2,38.5 97.2,81.5 60,103 22.8,81.5 22.8,38.5"
              fill={MEDAL.face}
            />
            <Ellipse cx={60} cy={86} rx={14} ry={3.5} fill={MEDAL.gold} fillOpacity={0.35} />
            <Path
              d="M60 30 c-11 0 -19 8.5 -19 19 c0 14 19 33 19 33 s19 -19 19 -33 c0 -10.5 -8 -19 -19 -19 z"
              fill={MEDAL.gold}
            />
            <Path
              d="M51.5 48.5 l6 6 l11 -12"
              stroke={MEDAL.onGold}
              strokeWidth={4.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : medalKey === 'well_received' ? (
          <>
            <Ribbons front={MEDAL.oldGold} back={MEDAL.goldDeep} />
            <G fill={MEDAL.gold}>
              <Circle cx={60} cy={60} r={48} />
              {ROSETTE.map(([x, y]) => (
                <Circle key={`${x},${y}`} cx={x} cy={y} r={8} />
              ))}
            </G>
            <Circle cx={60} cy={60} r={44} fill={MEDAL.oldGold} />
            <Circle cx={60} cy={60} r={39} fill={MEDAL.face} />
            <G fill={MEDAL.gold}>
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
            <Path
              d="M60 74 V40 M47 53 L60 40 L73 53"
              fill="none"
              stroke={MEDAL.glyph}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <G fill={MEDAL.gold}>
              {[47, 53.5, 60, 66.5, 73].map((x, i) => (
                <Circle key={x} cx={x} cy={[86, 88, 88.7, 88, 86][i]} r={2.3} />
              ))}
            </G>
          </>
        ) : (
          <>
            <Ribbons front={MEDAL.oldGold} back={MEDAL.goldDeep} />
            <Circle cx={60} cy={60} r={52} fill={MEDAL.oldGold} />
            <Circle cx={60} cy={60} r={40} fill={MEDAL.face} />
            <Path
              d="M60 38 L65.5 52 L80 53 L69 62.5 L72.5 77 L60 69 L47.5 77 L51 62.5 L40 53 L54.5 52 Z"
              fill={MEDAL.gold}
            />
          </>
        )}
      </Svg>
    </View>
  );
}

/**
 * The simple badge (24 × 24 artwork) next to a username on posts, comments and profiles.
 * Decorative there: the name row announces the medals as text.
 */
export function MedalBadge({ medalKey, size = 16 }: { medalKey: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {medalKey === 'first_contribution' ? (
        <>
          <Circle cx={12} cy={12} r={11} fill={MEDAL.teal} />
          <Path
            d="M7 7.5 h10 a1.6 1.6 0 0 1 1.6 1.6 v5 a1.6 1.6 0 0 1 -1.6 1.6 h-5 l-3 2.6 v-2.6 h-2 a1.6 1.6 0 0 1 -1.6 -1.6 v-5 a1.6 1.6 0 0 1 1.6 -1.6 z"
            fill={MEDAL.onTeal}
          />
        </>
      ) : medalKey === 'approved_contributor' ? (
        <>
          <Polygon points="12,0.8 21.7,6.4 21.7,17.6 12,23.2 2.3,17.6 2.3,6.4" fill={MEDAL.gold} />
          <Path
            d="M12 5.2 c-3 0 -5.2 2.3 -5.2 5.2 c0 3.8 5.2 8.6 5.2 8.6 s5.2 -4.8 5.2 -8.6 c0 -2.9 -2.2 -5.2 -5.2 -5.2 z"
            fill={MEDAL.onGold}
          />
          {size >= 20 ? (
            <Path
              d="M9.6 10.3 l1.7 1.7 l3.2 -3.4"
              stroke={MEDAL.gold}
              strokeWidth={1.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </>
      ) : medalKey === 'well_received' ? (
        <>
          <G fill={MEDAL.gold}>
            <Circle cx={12} cy={12} r={9.4} />
            {[
              [12, 2.4],
              [18.8, 5.2],
              [21.6, 12],
              [18.8, 18.8],
              [12, 21.6],
              [5.2, 18.8],
              [2.4, 12],
              [5.2, 5.2],
            ].map(([x, y]) => (
              <Circle key={`${x},${y}`} cx={x} cy={y} r={2} />
            ))}
          </G>
          <Path
            d="M12 16.5 V7.5 M8.2 11.3 L12 7.5 L15.8 11.3"
            fill="none"
            stroke={MEDAL.onGold}
            strokeWidth={size >= 20 ? 2.4 : 2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <Circle cx={12} cy={12} r={11} fill={MEDAL.oldGold} />
          <Path
            d="M12 6 L13.6 10 L17.8 10.3 L14.6 13 L15.6 17.2 L12 14.9 L8.4 17.2 L9.4 13 L6.2 10.3 L10.4 10 Z"
            fill={MEDAL.onGold}
          />
        </>
      )}
    </Svg>
  );
}

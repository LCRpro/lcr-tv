import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { BRAND_GRADIENT } from '@iptv/shared';

/**
 * La marque LCR TV — le triangle de lecture, aux couleurs du logo.
 *
 * Un rendu vectoriel plutôt qu'une image : net à toutes les tailles, de la
 * vignette de la barre à l'icône d'application. Le triangle extérieur porte le
 * dégradé cyan → bleu → violet de la charte (ses coins sont arrondis par un
 * trait de même dégradé, à jointures rondes) ; un second triangle, bleu de
 * nuit, y creuse l'encoche de lecture.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  const [c0, c1, c2] = BRAND_GRADIENT;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Defs>
        <LinearGradient id="brand" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={c0} />
          <Stop offset="0.5" stopColor={c1} />
          <Stop offset="1" stopColor={c2} />
        </LinearGradient>
      </Defs>
      <Polygon
        points="15,9 15,39 41,24"
        fill="url(#brand)"
        stroke="url(#brand)"
        strokeWidth={8}
        strokeLinejoin="round"
      />
      <Polygon points="23,18 23,30 33,24" fill="#0a0b14" strokeLinejoin="round" />
    </Svg>
  );
}

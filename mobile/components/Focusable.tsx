import { useState, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../lib/theme';
import { IS_TV } from '../lib/tv';

/** L'etat que les deux plateformes savent decrire, passe aux styles-fonctions. */
interface State {
  pressed: boolean;
  focused: boolean;
}

/**
 * Element actionnable, au doigt comme a la telecommande.
 *
 * Sur telephone c'est un `Pressable` ordinaire : rien ne change. Sur TV, il
 * devient focusable et **montre** son focus — c'est la seule chose qui dit ou
 * l'on se trouve quand il n'y a ni curseur ni doigt. Un ecran de television sans
 * etat de focus visible est litteralement impraticable.
 *
 * L'anneau est dessine par un halo et un agrandissement, pas par une bordure :
 * une bordure decalerait la mise en page a chaque deplacement du focus.
 *
 * Il accepte exactement la meme forme d'appel qu'un `Pressable` — style
 * constant ou fonction de l'etat, `hitSlop`, enfants ou fonction d'enfants — de
 * sorte que rendre un element navigable a la telecommande consiste a changer
 * son nom, et rien d'autre. C'est voulu : la couche TV a longtemps couvert les
 * seules vignettes parce que chaque conversion demandait de reecrire l'appel.
 */
export function Focusable({
  children,
  onPress,
  onLongPress,
  style,
  focusedStyle,
  disabled,
  hitSlop,
}: {
  children: ReactNode | ((state: State) => ReactNode);
  onPress: () => void;
  /** Appui long — au doigt (mobile, tablette) comme au select maintenu (tvOS). */
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle> | ((state: State) => StyleProp<ViewStyle>);
  /** Style additionnel quand l'element a le focus, au-dela de l'anneau. */
  focusedStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hitSlop?: number;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={disabled}
      hitSlop={hitSlop}
      // `focusable` n'a d'effet que sur les plateformes a telecommande ; le
      // poser inconditionnellement rendrait des elements navigables au clavier
      // sur telephone sans qu'aucun style ne le montre.
      focusable={IS_TV}
      onFocus={IS_TV ? () => setFocused(true) : undefined}
      onBlur={IS_TV ? () => setFocused(false) : undefined}
      style={({ pressed }) => [
        // L'estompe d'appui vient **avant** le style de l'appelant : c'est un
        // defaut, et un appelant qui choisit la sienne doit la garder.
        pressed && { opacity: 0.72 },
        typeof style === 'function' ? style({ pressed, focused }) : style,
        IS_TV && focused && tvFocusRing,
        IS_TV && focused && focusedStyle,
      ]}
    >
      {(state) => (typeof children === 'function' ? children({ ...state, focused }) : children)}
    </Pressable>
  );
}

/*
 * L'anneau ne touche pas au rayon de l'element.
 *
 * Il l'imposait : une puce en gelule redevenait un rectangle arrondi en
 * prenant le focus, c'est-a-dire au moment precis ou l'oeil la regarde. Le halo
 * suit de lui-meme la forme du composant — c'est le trace de son ombre.
 */
const tvFocusRing: ViewStyle = {
  transform: [{ scale: 1.06 }],
  shadowColor: colors.accent,
  shadowOpacity: 0.9,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 0 },
  elevation: 12,
};

/**
 * Zone qui garde le focus a l'interieur d'elle-meme.
 *
 * Sur `react-native-tvos` il existe `TVFocusGuideView`, qui rattrape le focus
 * quand il sortirait d'un bloc. Il n'existe pas ici : ce composant en tient la
 * place et sera remplace par le vrai quand la cible tvOS sera activee. Le
 * rendre neutre des maintenant evite d'avoir a retoucher tous les appelants.
 */
export function FocusGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={style}>{children}</View>;
}

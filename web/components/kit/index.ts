/**
 * Le kit : les primitives d'interface, sans aucune connaissance du catalogue.
 *
 * La distinction avec `components/ui.tsx` est nette et vaut d'être tenue :
 * ici vivent les briques — un bouton, un champ, une boîte de dialogue — qui
 * ignorent tout de ce qu'est un film ou une chaîne ; là-bas vivent les
 * compositions propres à l'application, qui s'en servent.
 *
 * Ce qui existait avant n'était ni l'un ni l'autre : des classes CSS que chaque
 * appel recopiait de mémoire.
 */
export { Button, ButtonLink, type ButtonSize, type ButtonVariant } from './Button';
export { Field, PasswordField, SelectField } from './Field';
export { Dialog } from './Dialog';
export { Switch, Tag, type Tone } from './Tag';

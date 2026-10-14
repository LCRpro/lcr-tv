import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';
import { colors } from '../lib/theme';

/**
 * Le fond des écrans d'accès — connexion et inscription.
 *
 * C'est le seul endroit que voit quelqu'un qui n'a pas encore de compte : il
 * doit montrer ce qu'il y a derrière. Les affiches viennent de la même route
 * publique que le web (`/api/auth/mosaic`), qui ne renvoie que des images
 * hébergées par TMDB — rien qui identifie un fournisseur. Sans catalogue, le
 * fond reste le bleu de nuit, seul.
 *
 * Le mobile est en portrait : au lieu des deux colonnes du web, un damier
 * d'affiches en haut, fondu dans le fond vers le bas où se pose le formulaire.
 */
export function AuthBackdrop() {
  const [posters, setPosters] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: string[] }>('/api/auth/mosaic')
      .then((res) => {
        if (!cancelled) setPosters(res.items);
      })
      .catch(() => {
        // Décoratif : sans affiches, le fond reste lisible.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      pointerEvents="none"
    >
      {posters.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', opacity: 0.32 }}>
          {posters.map((src) => (
            <Image
              key={src}
              source={{ uri: src }}
              style={{ width: '25%', aspectRatio: 2 / 3 }}
              resizeMode="cover"
            />
          ))}
        </View>
      ) : null}
      {/* Le voile : les affiches donnent la couleur, le formulaire reste net. */}
      <LinearGradient
        colors={['rgba(8,10,18,0.45)', 'rgba(8,10,18,0.82)', colors.bg]}
        locations={[0, 0.5, 0.92]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </View>
  );
}

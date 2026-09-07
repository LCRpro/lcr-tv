import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listQuerySchema,
  searchQuerySchema,
  type Category,
  type HomePayload,
  type LiveChannel,
} from '@iptv/shared';
import { ctx, viewerOf } from '../plugins/auth.js';
import {
  getChannel,
  getMovie,
  catalogLanguages,
  genreCounts,
  getSeriesDetail,
  homeRows,
  markFavorites,
  markResumeFavorites,
  listCategories,
  listFavorites,
  listHistory,
  listSeries,
  listStreams,
  recentMovies,
  recentSeries,
  resolvePlayable,
  search,
  similarTo,
  spotlight,
  type Viewer,
  arrivalsSince,
} from '../services/catalog.js';
import { getSyncStatus, isCatalogEmpty } from '../services/sync.js';
import {
  channelSchedule,
  guideFor,
  nowPlayingFor,
  shortEpgFromPanel,
} from '../services/epg.js';
import { slotUsage } from '../services/slots.js';
import { listProviders } from '../services/providers.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Liste d'identifiants passee en query, « 12,48,91 ».
 *
 * Bornee a une page de listing : au-dela, c'est que l'appelant demande autre
 * chose qu'un rafraichissement d'ecran.
 */
const idList = z
  .string()
  .transform((v) => v.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))
  .pipe(z.array(z.number().int().positive()).max(100));

const idsQuery = z.object({ ids: idList });

const guideQuery = z.object({
  ids: idList,
  /** ISO. Absent, la grille part de maintenant. */
  from: z.string().datetime().optional(),
  hours: z.coerce.number().int().min(1).max(12).default(3),
});
const typeParams = z.object({ type: z.enum(['live', 'vod', 'series']) });

/**
 * Le direct de l'accueil, en deux rangees.
 *
 * Les chaines epinglees d'abord : elles disent ce que le foyer regarde
 * vraiment. Puis « parcourir le direct », qui est le debut de la grille dans
 * l'ordre de la telecommande — TF1, France 2, France 3…
 *
 * La seconde rangee **ne retire pas** les epinglees. Elle l'a fait un temps,
 * pour eviter de montrer TF1 deux fois : mettre TF1 en favori la faisait alors
 * disparaitre de sous le curseur, et on croyait l'avoir perdue. Une liste de
 * chaines qui saute des numeros n'est plus une liste de chaines ; l'etoile ne
 * doit rien retirer de la grille, seulement ajouter un raccourci au-dessus.
 *
 * Les deux rangees portent le programme en cours. La liste de categories qui
 * tenait la seconde place ne repondait pas a « qu'est-ce qu'il y a a la tele »,
 * elle demandait de cliquer pour le savoir.
 */
/*
 * Quarante chaines pour la seconde rangee, et non quatorze : c'est elle qui
 * nourrit la telecommande de l'accueil, et la numerotation francaise va
 * jusqu'a 27 — avec les declinaisons de qualite entre deux, quatorze lignes
 * s'arretaient a France 5.
 */
async function liveForHome(
  viewer: Viewer,
  pinnedLimit = 20,
  browseLimit = 40,
): Promise<{ pinned: LiveChannel[]; browse: LiveChannel[] }> {
  const base = { sort: 'fr' as const, offset: 0 };
  const [starred, all] = await Promise.all([
    listStreams('live', { ...base, favorites: true, limit: pinnedLimit }, viewer),
    listStreams('live', { ...base, limit: browseLimit }, viewer),
  ]);
  return { pinned: starred.items as LiveChannel[], browse: all.items as LiveChannel[] };
}

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  /**
   * Accueil. Renvoie aussi l'etat du catalogue : au tout premier lancement, le
   * front doit afficher un ecran d'attente avec progression, pas une grille vide.
   */
  app.get('/home', async (req) => {
    const viewer = viewerOf(req);
    /*
     * Deux vides differents, deux ecrans differents.
     *
     * Sans abonnement, il n'y a rien a attendre : il faut en ajouter un. Avec
     * un abonnement mais sans catalogue, la synchronisation est en route et il
     * suffit de patienter. Afficher une progression a qui vient de s'inscrire
     * promettrait un catalogue qui n'arrivera jamais.
     */
    const providers = await listProviders(viewer.id);
    const empty = await isCatalogEmpty(viewer.id);
    if (empty) {
      const payload: HomePayload = {
        noProvider: providers.length === 0,
        catalogEmpty: true,
        sync: await getSyncStatus(viewer.id),
        spotlight: [],
        resume: [],
        favorites: [],
        arrivals: { since: null, movies: 0, series: 0 },
        recentMovies: [],
        recentSeries: [],
        livePinned: [],
        liveBrowse: [],
        rows: [],
      };
      return payload;
    }

    const [featured, resume, favorites, movies, seriesList, live, rows, sync, arrivals] =
      await Promise.all([
        spotlight(viewer),
        listHistory(viewer, { onlyUnfinished: true, limit: 20 }),
        listFavorites(viewer),
        recentMovies(viewer),
        recentSeries(viewer),
        liveForHome(viewer),
        homeRows(viewer),
        getSyncStatus(viewer.id),
        arrivalsSince(viewer),
      ]);

    /*
     * Une oeuvre ne parait qu'une fois sur la page.
     *
     * L'accueil porte une rangee « films recemment ajoutes » **et** des rangees
     * par categorie. Chez ce fournisseur la plus grosse categorie francaise
     * s'appelle « LATEST MOVIES » : les deux rangees affichaient exactement les
     * memes vignettes, l'une sous l'autre. Le tirage du jour des rangees de
     * categorie rend la collision rare ; ce filet la rend impossible.
     *
     * Une rangee reduite a moins de six titres est retiree plutot que montree
     * en moignon — c'est le signe que la categorie n'avait rien d'autre a dire.
     */
    const alreadyShown = new Set<string>([
      ...movies.map((m) => `vod-${m.id}`),
      ...seriesList.map((r) => `series-${r.id}`),
    ]);
    const freshRows = rows
      .map((row) => ({
        category: row.category,
        items: row.items.filter((i) => !alreadyShown.has(`${i.type}-${i.id}`)),
      }))
      .filter((row) => row.items.length >= 6);

    /*
     * L'etoile, sur toute la page d'un coup.
     *
     * Les listings marquent leurs favoris eux-memes ; les rangees d'accueil
     * viennent de requetes qui l'ignoraient, si bien qu'aucune vignette n'y
     * portait d'etoile — on ne pouvait rien ajouter a sa liste depuis la page
     * qui en montre le plus. Deux requetes pour l'ecran entier, et le direct
     * est exclu : il arrive deja marque.
     */
    await Promise.all([
      markFavorites(viewer, [...movies, ...seriesList, ...freshRows.flatMap((row) => row.items)]),
      // « Reprendre » aussi : c'est souvent la que l'envie d'ajouter arrive.
      markResumeFavorites(viewer, resume),
    ]);

    const payload: HomePayload = {
      noProvider: false,
      catalogEmpty: false,
      // Le front affiche un bandeau discret quand un sync tourne en fond.
      sync: sync.running ? sync : null,
      spotlight: featured,
      resume,
      favorites: favorites.slice(0, 20),
      recentMovies: movies,
      recentSeries: seriesList,
      arrivals,
      livePinned: live.pinned,
      liveBrowse: live.browse,
      rows: freshRows,
    };
    return payload;
  });

  app.get('/sync/status', async (req) => getSyncStatus(viewerOf(req).id));

  /**
   * Etat des connexions, visible par tous et pas seulement par l'admin : c'est
   * ce qui permet a chacun de savoir s'il peut lancer une lecture avant de
   * cliquer, plutot que de decouvrir un 409.
   */
  app.get('/connections', async (req) => slotUsage(ctx(req).user.id));

  /**
   * Les langues du catalogue, pour le selecteur d'un profil. Celles du compte
   * qui demande, et elles seules : un autre abonnement n'a pas le meme
   * catalogue.
   *
   * `ctx` et non `viewerOf` : on la consulte depuis l'ecran des profils, ou
   * aucun profil n'est encore choisi. Exiger le profil y renvoyait 409 et le
   * selecteur restait desesperement vide.
   */
  app.get('/languages', async (req) => {
    const items = await catalogLanguages(ctx(req).user.id);
    return { items };
  });

  app.get('/categories/:type', async (req) => {
    const { type } = typeParams.parse(req.params);
    const items: Category[] = await listCategories(type, viewerOf(req));
    return { items };
  });

  /**
   * Les genres d'une famille, avec leurs comptes.
   *
   * Les pages Films et Series s'en servent comme d'un filtre — les categories
   * du fournisseur n'en sont pas un : « LATEST MOVIES » ne dit rien de ce
   * qu'on va voir. Le direct n'a pas de genre, il a des categories.
   */
  app.get('/genres/:type', async (req) => {
    const { type } = z.object({ type: z.enum(['vod', 'series']) }).parse(req.params);
    return { items: await genreCounts(type, viewerOf(req)) };
  });

  app.get('/live', async (req) => {
    const params = listQuerySchema.parse(req.query);
    return listStreams('live', params, viewerOf(req));
  });

  app.get('/films', async (req) => {
    const params = listQuerySchema.parse(req.query);
    return listStreams('vod', params, viewerOf(req));
  });

  app.get('/films/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    return getMovie(id, viewerOf(req));
  });

  /** Huit films du meme genre, pour continuer depuis une fiche. */
  app.get('/films/:id/similar', async (req) => {
    const { id } = idParams.parse(req.params);
    return { items: await similarTo('movie', id, viewerOf(req)) };
  });

  app.get('/series', async (req) => {
    const params = listQuerySchema.parse(req.query);
    return listSeries(params, viewerOf(req));
  });

  app.get('/series/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    return getSeriesDetail(id, viewerOf(req));
  });

  app.get('/series/:id/similar', async (req) => {
    const { id } = idParams.parse(req.params);
    return { items: await similarTo('series', id, viewerOf(req)) };
  });

  /**
   * Ce qui passe maintenant sur un lot de chaines.
   *
   * La grille se fige autrement : le programme est chargé avec la page et ne
   * bouge plus, si bien qu'à 21 h les vignettes annoncent encore celui de 20 h.
   * Le front rappelle cette route pour les chaînes qu'il affiche.
   */
  app.get('/live/now', async (req) => {
    const { ids } = idsQuery.parse(req.query);
    // Le contrôle d'accès reste porté par le listing : on ne renvoie ici que des
    // titres de programmes, pour des identifiants que le client a déjà obtenus.
    const map = await nowPlayingFor(ids);
    return { items: Object.fromEntries(map) };
  });

  /**
   * Grille horaire d'un lot de chaines sur une plage de temps.
   *
   * Les identifiants viennent du listing, qui porte la pagination, les filtres
   * et le contrôle d'accès : la grille n'est qu'une seconde lecture des mêmes
   * chaînes, elle n'a pas à les resélectionner.
   */
  app.get('/live/guide', async (req) => {
    const { ids, from, hours } = guideQuery.parse(req.query);
    const start = from ? new Date(from) : new Date();
    const end = new Date(start.getTime() + hours * 3600_000);
    const map = await guideFor(ids, start, end);
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      items: Object.fromEntries(map),
    };
  });

  /**
   * Fiche d'une chaine : ses qualites disponibles et son programme.
   *
   * Consommee par le lecteur a l'ouverture — une chaine n'a pas de page a elle.
   */
  app.get('/live/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    return getChannel(id, viewerOf(req));
  });

  /**
   * Grille d'une chaine. On sert la grille XMLTV importee ; si elle est vide
   * (import jamais lance, ou chaine non rattachee), on interroge le panel pour
   * cette seule chaine plutot que de renvoyer une liste vide.
   */
  app.get('/live/:id/epg', async (req) => {
    const { id } = idParams.parse(req.params);
    // Resolution normale du contenu : elle porte le controle d'acces adulte et
    // le 404 sur une chaine inconnue ou retiree.
    await resolvePlayable('stream', id, viewerOf(req));
    const fromGrid = await channelSchedule(id);
    if (fromGrid.length > 0) return { items: fromGrid, source: 'xmltv' };
    try {
      return { items: await shortEpgFromPanel(id), source: 'panel' };
    } catch {
      return { items: [], source: 'none' };
    }
  });

  app.get('/search', async (req) => {
    const { q, limit } = searchQuerySchema.parse(req.query);
    return search(q, limit, viewerOf(req));
  });
};

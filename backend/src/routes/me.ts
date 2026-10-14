import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  favoriteCategorySchema,
  favoriteSchema,
  itemTypeSchema,
  progressSchema,
  seenSchema,
  tagCreateSchema,
  tagIdParams,
  tagItemSchema,
  tagsForItemQuery,
} from '@iptv/shared';
import { ctx, viewerOf } from '../plugins/auth.js';
import {
  addTagItem,
  createTag,
  deleteTag,
  listTags,
  removeTagItem,
  tagsForItem,
} from '../services/tags.js';
import {
  listUserSessions,
  revokeOtherSessions,
  revokeOwnSession,
  setAccountAdult,
} from '../services/auth.js';
import { killSlot, listActiveSlots, slotUsage } from '../services/slots.js';
import {
  listFavorites,
  listHistory,
  listSeries,
  listStreams,
  toggleFavoriteCategory,
  type Viewer,
} from '../services/catalog.js';
import {
  addFavorite,
  deleteProgress,
  markSeen,
  removeFavorite,
  saveProgress,
} from '../services/personal.js';

const favoriteParams = z.object({
  itemType: z.enum(['stream', 'series']),
  itemId: z.coerce.number().int().positive(),
});

const historyParams = z.object({
  itemType: itemTypeSchema,
  itemId: z.coerce.number().int().positive(),
});

const historyQuery = z.object({
  onlyUnfinished: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const categoryParams = z.object({
  categoryId: z.coerce.number().int().positive(),
});

const tagItemRouteParams = z.object({
  tagId: z.coerce.number().int().positive(),
  itemType: z.enum(['stream', 'series']),
  itemId: z.coerce.number().int().positive(),
});

const favoritesQuery = z.object({
  type: z.enum(['stream', 'series']).optional(),
});

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  // ------------------------------------------------------------- favoris

  app.get('/favorites', async (req) => {
    const { type } = favoritesQuery.parse(req.query);
    return { items: await listFavorites(viewerOf(req), type) };
  });

  app.post('/favorites', async (req) => {
    const input = favoriteSchema.parse(req.body);
    // Les favoris appartiennent au profil, pas au compte : c'est son `profileId`
    // qu'il faut écrire, celui-là même que la lecture interroge.
    await addFavorite(viewerOf(req).profileId, input.itemType, input.itemId);
    return { ok: true };
  });

  app.delete('/favorites/:itemType/:itemId', async (req) => {
    const { itemType, itemId } = favoriteParams.parse(req.params);
    await removeFavorite(viewerOf(req).profileId, itemType, itemId);
    return { ok: true };
  });

  /*
   * Categories epinglees.
   *
   * Elles ne passent pas par `/favorites` : une categorie n'a ni progression,
   * ni libelle a reconstituer, ni image. L'etat courant est renvoye par
   * `/api/categories/:type`, la barre laterale n'a donc rien de plus a charger.
   */
  app.post('/favorites/categories', async (req) => {
    const { categoryId } = favoriteCategorySchema.parse(req.body);
    await toggleFavoriteCategory(viewerOf(req).profileId, categoryId, true);
    return { ok: true };
  });

  app.delete('/favorites/categories/:categoryId', async (req) => {
    const { categoryId } = categoryParams.parse(req.params);
    await toggleFavoriteCategory(viewerOf(req).profileId, categoryId, false);
    return { ok: true };
  });

  // --------------------------------------------------------------- étiquettes
  //
  // Les rayonnages du profil. `GET /tags` liste ses étiquettes ; avec un couple
  // itemType/itemId, il dit en plus lesquelles contiennent ce contenu (pour
  // cocher le sélecteur). `.../contents` rend tout ce qu'une étiquette range,
  // tous types confondus — c'est ce que montre le compte.

  app.get('/tags', async (req) => {
    const { itemType, itemId } = tagsForItemQuery.parse(req.query);
    const { profileId } = viewerOf(req);
    if (itemType && itemId != null) {
      return { items: await tagsForItem(profileId, itemType, itemId) };
    }
    return { items: await listTags(profileId) };
  });

  app.post('/tags', async (req) => {
    const { name } = tagCreateSchema.parse(req.body);
    return createTag(viewerOf(req).profileId, name);
  });

  app.delete('/tags/:tagId', async (req) => {
    const { tagId } = tagIdParams.parse(req.params);
    await deleteTag(viewerOf(req).profileId, tagId);
    return { ok: true };
  });

  app.post('/tags/:tagId/items', async (req) => {
    const { tagId } = tagIdParams.parse(req.params);
    const { itemType, itemId } = tagItemSchema.parse(req.body);
    await addTagItem(viewerOf(req).profileId, tagId, itemType, itemId);
    return { ok: true };
  });

  app.delete('/tags/:tagId/items/:itemType/:itemId', async (req) => {
    const { tagId, itemType, itemId } = tagItemRouteParams.parse(req.params);
    await removeTagItem(viewerOf(req).profileId, tagId, itemType, itemId);
    return { ok: true };
  });

  app.get('/tags/:tagId/contents', async (req) => {
    const { tagId } = tagIdParams.parse(req.params);
    const viewer = viewerOf(req);
    const base = { tagId, sort: 'name' as const, limit: 200, offset: 0 };
    const [movies, live, series] = await Promise.all([
      listStreams('vod', base, viewer),
      listStreams('live', base, viewer),
      listSeries(base, viewer),
    ]);
    return { live: live.items, movies: movies.items, series: series.items };
  });

  // --------------------------------------------------- progression / historique

  app.get('/history', async (req) => {
    const { onlyUnfinished, limit } = historyQuery.parse(req.query);
    return {
      items: await listHistory(viewerOf(req), {
        onlyUnfinished: onlyUnfinished ?? false,
        limit,
      }),
    };
  });

  app.patch('/progress', async (req) => {
    const input = progressSchema.parse(req.body);
    return saveProgress({
      profileId: viewerOf(req).profileId,
      itemType: input.itemType,
      itemId: input.itemId,
      positionSec: input.positionSec,
      durationSec: input.durationSec,
    });
  });

  app.delete('/history/:itemType/:itemId', async (req) => {
    const { itemType, itemId } = historyParams.parse(req.params);
    await deleteProgress(ctx(req).user.id, itemType, itemId);
    return { ok: true };
  });

  /**
   * « Marquer comme vu », depuis une fiche ou la liste.
   *
   * Le geste manquait : rien ne se marquait sans etre regarde jusqu'au bout,
   * et la liste ne se vidait jamais. `seen: false` defait le marquage.
   */
  app.post('/seen', async (req) => {
    const input = seenSchema.parse(req.body);
    await markSeen(viewerOf(req).profileId, input.itemType, input.itemId, input.seen);
    return { ok: true };
  });

  // ------------------------------------------------------------ appareils

  app.get('/sessions', async (req) => {
    const { user, session } = ctx(req);
    return { items: await listUserSessions(user.id, session.id) };
  });

  app.delete('/sessions/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await revokeOwnSession(ctx(req).user.id, id);
    return { ok: true };
  });

  /**
   * Tous les autres appareils d'un coup, celui-ci excepte.
   *
   * Dix-sept sessions dont quinze d'un outil de test : une requete par ligne
   * en faisait un geste de patience. Celle-ci ne touche jamais la session qui
   * la demande — se deconnecter soi-meme passe par le menu du compte.
   */
  app.delete('/sessions', async (req) => {
    const { user, session } = ctx(req);
    return { revoked: await revokeOtherSessions(user.id, session.id) };
  });

  // ------------------------------------------------------------- lectures

  /**
   * Ses propres lectures en cours.
   *
   * C'est ce qu'on regarde quand l'indicateur dit « Occupe » : savoir *qui*,
   * dans le foyer, tient la connexion qu'on voudrait prendre. Les lectures des
   * autres comptes n'y figurent pas — elles occupent leur abonnement, pas le
   * notre.
   */
  app.get('/slots', async (req) => {
    const userId = ctx(req).user.id;
    return { items: await listActiveSlots(userId), usage: await slotUsage(userId) };
  });

  app.delete('/slots/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await killSlot(id, ctx(req).user.id);
    return { ok: true };
  });

  // -------------------------------------------------------------- reglages

  /**
   * Le plafond « categories adultes » du compte.
   *
   * Il etait pose par un administrateur du temps ou le catalogue etait commun.
   * Chaque compte apportant son abonnement, c'est desormais son affaire : le
   * plafond se regle ici, et chaque profil choisit en dessous — un profil
   * enfant restant ferme quoi qu'il arrive.
   */
  app.patch('/settings', async (req) => {
    const { canWatchAdult } = z.object({ canWatchAdult: z.boolean() }).parse(req.body);
    const { user } = ctx(req);
    await setAccountAdult(user.id, canWatchAdult);
    return { canWatchAdult };
  });
};

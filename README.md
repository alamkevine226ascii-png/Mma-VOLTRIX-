# VOLTRIX — MMA · Statistiques & Pronostics

Application **100 % frontend** de suivi du MMA : événements, cartes de combats,
fiches combattants, comparaisons statistiques et **pronostics fondés sur des
données observées** — sans aucun serveur, sans base de données.

> ⚡ Votre navigateur appelle directement les endpoints **publics d'ESPN**
> (CORS ouvert), met tout en cache localement (sessionStorage) et exécute le
> moteur d'analyse et de pronostics en local. Aucune donnée ne transite par
> un serveur tiers.

---

## Fonctionnalités

- **Événements** : cartes officielles UFC et PFL (à venir + résultats),
  groupées par organisation, tête d'affiche, lieu, compte à rebours.
- **Carte d'événement** : combats par segment (carte principale, prelims),
  catégorie de poids en français, rounds prévus, statuts
  (Programmé / Confirmé / Reporté / Annulé / Terminé / En cours),
  résultats avec méthode et durée, **pronostic express** par combat.
- **Page combat** (5 onglets) :
  - **Pronostic** : favori, probabilités bornées 25-75 %, fiabilité des
    données, issue la plus probable (KO/soumission/décision), facteurs clés,
    points de vigilance, méthodologie dépliable avec les 11 pondérations ;
  - **Comparaison** : tableau de données observées sourcées, radar et barres
    par dimension, commentaires, limites ;
  - **Historique** : derniers combats des deux athlètes ;
  - **Styles** : garde, style répertorié, méthodes de victoire ;
  - **Sources** : chaque donnée liée à sa fiche ESPN, horodatée.
- **Vérification rétrospective** : sur un combat terminé, l'application
  montre ce que le modèle aurait dit et le confronte au vainqueur réel.
- **Paramètres** : documentation des sources, gestion du cache local,
  pondérations publiques du modèle, **vérification du modèle en direct**
  (backtest navigateur sur les derniers événements passés).

## Architecture (frontend pur)

```
src/
├── app/                      # Next.js App Router — une seule route « / »
│   ├── layout.tsx            # Métadonnées, thème, police
│   └── page.tsx              # Onglets Accueil / Paramètres
├── components/
│   ├── voltrix/              # Coquille « Glass & Layered », Paramètres,
│   │   │                     # hook useAsyncData, formatage de dates FR
│   ├── mma/                  # Vues : liste d'événements, carte d'événement,
│   │                         # page combat (pronostic, comparaison…)
│   └── ui/                   # Composants shadcn/ui
└── lib/
    ├── espn.ts               # Adaptateur ESPN navigateur : fetch + cache
    │                         # (mémoire + sessionStorage) + concurrence ≤ 4
    └── mma/
        ├── types.ts          # Domaine pur : statuts, durées, palmarès…
        ├── analysis.ts       # Analyse : vues, tableaux, dimensions,
        │                     # indicateurs avancés calculés (fenêtre 8 combats)
        ├── prediction.ts     # Moteur de pronostics voltrix-mma-v1 (pur)
        └── loaders.ts        # Assemblage des données pour chaque vue
```

**Ce qu'il n'y a plus** (supprimé en v3.0) : routes API, base de données,
Prisma, ordonnanceur de synchronisation, journaux serveur. Toute la logique
vit dans le navigateur.

## Source de données

Endpoints publics ESPN (aucune clé, CORS `access-control-allow-origin: *`) :

| Endpoint | Usage | Cache |
|---|---|---|
| `site.api.espn.com/…/mma/{ligue}/scoreboard?dates=…` | Événements et combats | 10 min |
| `sports.core.api.espn.com/…/competitions/{id}` | Catégorie, rounds, segment | 1 h |
| `…/competitions/{id}/status` | Résultat, méthode, durée | 1 h |
| `…/athletes/{id}` · `/statistics` · `/records/0` | Fiche, stats de carrière, palmarès | 12-24 h |
| `site.web.api.espn.com/…/athletes/{id}` | Historique des combats | 24 h |

Cadre d'usage : personnel et non commercial (les conditions Disney/ESPN
réservent l'usage commercial à une licence). Les requêtes sont limitées à
4 simultanées, mises en cache, avec relance polie en cas de bridage (403/429).

## Modèle de pronostics `voltrix-mma-v1`

Agrégation pondérée de 11 dimensions observées → transformation logistique →
**probabilités bornées entre 25 % et 75 %**.

| Dimension | Poids | Source |
|---|---|---|
| Forme récente (5 combats) | 1,5 | Historique ESPN |
| Volume de frappes (SLpM) | 1,2 | Stats de carrière ESPN |
| Précision des frappes | 1,2 | Stats de carrière ESPN |
| Frappes absorbées (SApM) | 1,2 | Calcul navigateur (8 derniers combats) |
| Défense contre les frappes | 1,0 | Calcul navigateur |
| Lutte (takedowns / 15 min) | 1,0 | Stats de carrière ESPN |
| Défense contre les takedowns | 1,0 | Calcul navigateur |
| Soumissions tentées / 15 min | 0,8 | Stats de carrière ESPN |
| Pouvoir de finition (KO+TKO) | 1,0 | Stats + palmarès ESPN |
| Expérience (combats disputés) | 0,8 | Palmarès ESPN |
| Envergure physique (allonge) | 0,6 | Fiche ESPN |

Règles d'honnêteté (appliquées dans le code et affichées dans l'interface) :

- **aucune donnée fabriquée** — une valeur absente reste « Non disponible » ;
- **refus sans base** : moins de 3 dimensions comparables → pas de pronostic ;
- **indécis assumé** : écart trop serré → aucun favori désigné ;
- pondérations publiques, vérification rétrospective par combat ;
- **aucune cote, aucun conseil de paris** — par conception.

## Lancer en local

```bash
# avec Bun
bun install
bun run dev        # http://localhost:3000

# ou avec npm
npm install
npm run dev
```

## Déploiement statique

L'application est un site statique (`output: "export"` dans `next.config.ts`) :

```bash
npm run build      # produit le dossier out/
npx serve out      # aperçu local du build
```

Le dossier `out/` se déploie tel quel sur **GitHub Pages**, **Netlify**,
**Vercel** (mode statique) ou n'importe quel hébergeur de fichiers.

## Tests

```bash
bun test src/lib/mma/__tests__/frontend.test.ts   # fonctions pures (sans réseau)
bun run lint                                      # ESLint
```

Couverture : mappages de statuts, formule de durée (validée sur cas réels),
palmarès, normalisation, placeholders TBA, moteur de pronostics (bornes,
symétrie, refus sans données, méthode prédite), construction des vues.

## Limites connues

- Les données dépendent de la disponibilité des endpoints publics ESPN ;
  en cas de blocage réseau, l'application affiche une erreur avec réessai.
- Les indicateurs avancés (frappes reçues/minute, défenses, temps moyen)
  sont calculés dans le navigateur sur les 8 derniers combats et nécessitent
  quelques secondes au premier affichage (ensuite en cache 12 h).
- La vérification du modèle porte un biais de recul documenté : les
  statistiques utilisées sont celles connues aujourd'hui, pas celles au
  moment des combats passés.
- Le modèle ignore ce que les statistiques ne voient pas (blessures, camps,
  dynamique du soir) — rappelé dans l'interface.

---

**VOLTRIX v3.0** — MMA uniquement, 100 % frontend. Historique : v1 module MMA
ajouté au football, v2 suppression du football + moteur de pronostics,
v3 suppression du backend (tout vit dans le navigateur).

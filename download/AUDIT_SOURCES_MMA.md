# AUDIT DES SOURCES DE DONNÉES MMA — VOLTRIX
*Date : 8 novembre 2026 — Toutes les constatations ci-dessous proviennent de requêtes HTTP réellement exécutées depuis l'environnement de développement (scripts/audit_espn*.py, fixtures brutes dans scripts/fixtures/). Aucune supposition.*

## 1. ESPN (source retenue)

### 1.1 Endpoints vérifiés (tous HTTP 200, sans clé d'API)

| Endpoint | Contenu vérifié |
|---|---|
| `GET site.api.espn.com/apis/site/v2/sports/mma/{ligue}/scoreboard` | Événements : nom, date/heure, statut (pre/in/post), lieu (nom, ville, pays), carte complète des combats avec combattants et records. Paramètre `?dates=YYYYMMDD-YYYYMMDD` vérifié. |
| `GET .../scoreboard/{eventId}` | Détail d'un événement (même structure). |
| `GET sports.core.api.espn.com/v2/sports/mma/leagues/{ligue}/events/{eid}/competitions/{cid}` | Détail d'un combat : **catégorie de poids** (`type`), **rounds prévus** (`format.regulation.periods`, horloge 300 s), segment de carte (`cardSegment` : Main Card / Prelims / Early Prelims), statut, date, lieu, officiels. |
| `GET sports.core.api.espn.com/v2/sports/mma/athletes/{id}` | Fiche combattant : nom complet, surnom, date de naissance, âge, nationalité + drapeau, taille (po), **allonge** (po), poids, catégorie, **garde** (Orthodox/Southpaw/Switch), style, photo (headshot CDN), statut actif. |
| `GET .../athletes/{id}/statistics` | **Statistiques de carrière** : frappes significatives/min (SLpM), précision frappes %, précision takedowns %, takedowns moyens/15 min, soumissions tentées/15 min, KO %, TKO %, décisions %. |
| `GET .../athletes/{id}/records/0` | Palmarès détaillé : victoires, défaites, nuls, no-contests, victoires/défaites par KO/TKO/soumission, combats de titre (V/D/N). |
| `GET .../athletes/{id}/eventlog` | Historique des combats (références). |
| `GET site.web.api.espn.com/apis/common/v3/sports/mma/athletes/{id}` | Historique détaillé : date, résultat (W/L/D/NC), adversaire, nom d'événement, indicateur combat de titre (vérifié : 35 combats pour Morgan Charrière). |
| `GET .../competitions/{cid}/competitors/{fid}/statistics` | **Stats détaillées par combat terminé** : frappes totales et significatives (tentées/portées, par zone tête/corps/jambes, par position distance/clinch/sol), takedowns tentés/réussis, soumissions, temps de contrôle, passes, inversions, knockdowns. |

### 1.2 Organisations couvertes (vérifié le 2026-11-08)

| Organisation | Statut HTTP | Contenu constaté |
|---|---|---|
| **UFC** | 200 | 7 événements à venir (2026-11-14 → 2027-02-06) incl. cartes numérotées, Fight Nights ; événements passés avec résultats complets ; **inclut Dana White's Contender Series**. 54 événements / 609 combats sur 12 mois glissants. |
| **PFL** | 200 | 9 événements sur 12 mois ; événement à venir vérifié (PFL Dubai, 15 combats) avec mêmes structures. |
| **Bellator** | 200 | **Historique uniquement** (dernier événement : sept. 2024 ; ligue dissoute après rachat par PFL). 0 événement sur la fenêtre juin 2026→juin 2027. |
| **ONE Championship** | 400 | Non couvert par l'API ESPN. |

### 1.3 Fraîcheur et fréquence de mise à jour (vérifié)

- `Cache-Control: max-age=6` à `max-age=10` sur le scoreboard → données rafraîchies en continu (temps réel, mêmes endpoints que le site ESPN).
- Résultats post-combat présents immédiatement après la fin des événements (vérifié sur 17 événements passés : vainqueurs, records mis à jour, plays, stats détaillées par combat).
- Données pré-combat complètes : catégorie, rounds, segment, fiche et stats de carrière des deux combattants.
- Profondeur historique : au moins 2020 (vérifié janv. 2020 et janv. 2024).

### 1.4 Limites de requêtes (vérifié)

- Rafale de 15 requêtes : 0 code 429. Aucune limite documentée → VOLTRIX s'auto-limitrera (by design : ≤ 1 req/s, file séquentielle).

### 1.5 Limites de données constatées (important)

- **Non exposés en carrière** : frappes significatives reçues/min (SApM), défense contre les frappes, défense contre les takedowns, temps moyen de combat. → **Calculables à la demande** à partir des stats par combat (fenêtre explicite, ex. « 10 derniers combats »), jamais fabriqués.
- `athletes/{id}/statistics` via le chemin `/leagues/ufc/` → 404 ; le chemin correct est `/v2/sports/mma/athletes/{id}/statistics` (sans ligue). Disponibilité constatée : 100 % des combattants UFC testés (fiche + stats), 0 % des profils DWCS récents testés (10/10 en 404) → gestion des données manquantes obligatoire.
- Le scoreboard n'embarque pas la catégorie de poids par combat → 1 requête Core par combat requise (cache obligatoire).
- Les cotes (`odds`) sont présentes dans les payloads → **ignorées volontairement** (règle : aucun système de paris).
- `www.espn.com` (HTML) bloque les requêtes non-navigateur (CloudFront 403) — seuls les endpoints JSON API sont utilisés.

### 1.6 Conditions d'utilisation (vérifié via CGU Disney/ESPN)

- Les CGU Disney applicables à ESPN interdisent l'accès automatisé aux propriétés Disney et l'usage commercial sans licence.
- Ces endpoints JSON sont publics, sans clé, mais **non documentés officiellement** ; ESPN n'offre plus de programme API public (developer.espn.com inactif pour le public).
- **Conclusion documentée** : usage acceptable pour un projet personnel/non-commercial (cas VOLTRIX) ; tout usage commercial exigerait une licence officielle (ex. Sportradar). L'architecture prévoit un adaptateur « provider » interchangeable pour basculer vers un fournisseur sous licence sans réécriture.

## 2. Fournisseurs alternatifs

| Fournisseur | Vérification | Couverture | Conditions | Verdict |
|---|---|---|---|---|
| **API-Sports MMA** (api-sports.io) | Docs officielles consultées (site protégé Cloudflare : test réel impossible sans compte) | UFC (fights, fighters, catégories, saisons) ; inclut des cotes | Clé RapidAPI requise ; gratuit 100 req/jour « pour toujours » ; plans payants ; CGU dédiées | **Plan B documenté** — officiel et documenté, mais quota gratuit trop faible pour une synchronisation complète ; couverture plus étroite qu'ESPN |
| **Sportradar MMA** | Page officielle consultée | Tous les événements UFC incl. DWCS ; fight nights ajoutés < 72 h après annonce | Commercial, sous licence entreprise, payant | Option professionnelle si VOLTRIX passe en commercial |
| **SportsDataIO MMA** | Page officielle consultée | Couverture MMA temps réel | Commercial, payant | Idem Sportradar |
| **TheSportsDB** | **Test réel avec clé publique** ("123") | Recherche MMA → `null` ; aucune ligue MMA exposée en clé test | Gratuit non-commercial / premium | **Écarté** (pas de couverture MMA vérifiable) |
| **UFC officiel** | Recherche | Aucune API publique | — | **Écarté** |
| **Tapology / Sherdog / MMAFighting** | Constat connu | Pas d'API publique ; scraping contraire à leurs CGU | — | **Écartés** (règle : pas de scraping interdit) |

## 3. Décision

**Source principale : ESPN** (gratuit, sans clé, riche, vérifié de bout en bout : événements, combats, fiches, stats de carrière, stats par combat, historique). **UFC + PFL actifs ; Bellator en historique ; ONE non couvert.**
Chaque donnée stockée porte sa source (`espn`) et sa date de synchronisation. Les statistiques manquantes sont marquées « non disponible », jamais estimées.

# VOLTRIX v2.0 — Documentation des routes API

> Mise à jour du 2026-11-08 — suppression totale du module football, ajout du
> moteur de pronostics. Toutes les routes ci-dessous ont été exécutées réellement
> lors des tests (cf. `RESULTATS_TESTS_MMA.txt`).

Application : Next.js 16 (App Router), base SQLite via Prisma.
Source de données : ESPN (endpoints publics vérifiés — cf. `AUDIT_SOURCES_MMA.md`).

---

## Sommaire

| Route | Méthode | Description | Statut |
|---|---|---|---|
| `/api` | GET | État du service, modules actifs | modifiée v2.0 |
| `/api/mma/events` | GET | Liste des événements (à venir / passés) | inchangée |
| `/api/mma/events/[id]` | GET | Carte complète d'un événement | **modifiée v2.0** (pronostic express) |
| `/api/mma/fights/[id]` | GET | Analyse complète d'un combat | **modifiée v2.0** (pronostic) |
| `/api/mma/fighters/[id]` | GET | Fiche complète d'un combattant | inchangée |
| `/api/mma/sync` | GET/POST | État et déclenchement de la synchronisation | inchangée |
| `/api/mma/predictions` | GET | **NOUVELLE v2.0** — backtest public du modèle | nouvelle |
| ~~`/api/football/matches`~~ | ~~GET~~ | **SUPPRIMÉE v2.0** (404) | supprimée |

---

## GET `/api`

État du service.

```json
{
  "app": "VOLTRIX",
  "version": "2.0.0",
  "modules": ["mma"],
  "features": ["evenements", "combats", "combattants", "statistiques", "pronostics"],
  "status": "ok"
}
```

---

## GET `/api/mma/events?window=upcoming|past`

Liste les événements MMA (UFC, PFL ; Bellator en historique) synchronisés depuis
ESPN, avec nombre de combats et tête d'affiche.

- `window=upcoming` (défaut) : événements à venir, triés par date croissante.
- `window=past` : événements terminés, triés par date décroissante.
- Déclenche une synchronisation si les données ont plus de 30 minutes.

```json
{
  "events": [
    {
      "id": "cmw…",
      "name": "UFC 334: Gane vs. Hokit",
      "organization": "UFC",
      "date": "2026-11-14T22:00:00.000Z",
      "status": "PROGRAMME",
      "venue": "Madison Square Garden",
      "city": "New York",
      "country": "USA",
      "fightsCount": 13,
      "mainEvent": "Josh Hokit vs. Ciryl Gane",
      "detailsSynced": true,
      "lastSyncedAt": "2026-11-08T13:12:07.441Z"
    }
  ],
  "lastSyncAt": "2026-11-08T13:12:03.112Z",
  "syncStatus": null
}
```

Statuts possibles : `PROGRAMME | CONFIRME | REPORTE | ANNULE | TERMINE | EN_COURS`.

---

## GET `/api/mma/events/[id]` — modifiée v2.0

Carte complète d'un événement, combats triés par segment (Main Card → Prelims →
Early Prelims) puis numéro de match. Enrichit les détails (catégorie, rounds)
à la demande si nécessaire.

**Nouveauté v2.0** : chaque combat à venir (non terminé) comporte un champ
`expressPrediction` — pronostic léger fondé uniquement sur le palmarès et la
forme récente, clairement étiqueté comme tel.

```json
{
  "event": {
    "id": "cmw…",
    "name": "UFC 334: Gane vs. Hokit",
    "organization": "UFC",
    "date": "2026-11-14T22:00:00.000Z",
    "status": "PROGRAMME",
    "venue": "Madison Square Garden",
    "fights": [
      {
        "id": "cmw…",
        "weightClass": "Heavyweight",
        "weightClassFr": "Lourd",
        "scheduledRounds": 5,
        "cardSegment": "Main Card",
        "status": "CONFIRME",
        "expressPrediction": {
          "available": true,
          "favoriteName": "Josh Hokit",
          "probability": 61,
          "level": "avantage net",
          "basis": "palmarès + forme"
        },
        "fighters": [
          {
            "id": "cmw…",
            "externalId": "espn:athlete:4324622",
            "fullName": "Ciryl Gane",
            "wins": 14, "losses": 2, "draws": 0,
            "lastResults": "W,D,W,W,L",
            "recordAtFight": "14-2-0",
            "isWinner": null,
            "profileSynced": true
          }
        ]
      }
    ]
  }
}
```

Règles du pronostic express :
- `available=false` si ni palmarès ni forme exploitables (jamais d'invention) ;
- `favoriteName=null` + `level="indécis"` si l'écart est trop serré (|p−50| < 5) ;
- probabilité bornée [30 % ; 70 %] ;
- `null` pour les combats terminés (jamais de pronostic a posteriori en express).

---

## GET `/api/mma/fights/[id]?deep=1` — modifiée v2.0

Analyse complète d'un combat : fiches des deux combattants (bio, palmarès,
stats de carrière, indicateurs calculés sur 10 combats, historique), tableau
des données observées sourcées, dimensions d'interprétation, radar,
commentaires, sources, limites.

**Nouveauté v2.0** : champ `prediction` — pronostic complet du modèle
`voltrix-mma-v1`.

```json
{
  "fight": { "id": "…", "status": "CONFIRME", "weightClass": "Heavyweight",
             "scheduledRounds": 5, "winner": null },
  "event": { "name": "UFC 334: Gane vs. Hokit", "organization": "UFC", "…": "…" },
  "fighters": [ { "…": "fiche combattant A" }, { "…": "fiche combattant B" } ],
  "observed":   [ { "label": "Précision des frappes", "valueA": "58 %", "valueB": "52 %",
                   "kind": "career", "origin": "ESPN · stats de carrière" } ],
  "dimensions": [ { "key": "volume", "label": "Volume de frappes",
                    "scoreA": 37.2, "scoreB": 62.8, "advantage": "B",
                    "basis": "Carrière (ESPN)", "available": true } ],
  "radar": [ { "dimension": "Volume de frappes", "A": 37.2, "B": 62.8 } ],
  "prediction": {
    "available": true,
    "favorite": "B",
    "favoriteName": "Josh Hokit",
    "favoriteExternalId": "espn:athlete:4712345",
    "underdogName": "Ciryl Gane",
    "probabilityA": 40,
    "probabilityB": 60,
    "marginLabel": "avantage marqué",
    "confidence": {
      "score": 100, "label": "Bonne",
      "dimensionsUsed": 11, "dimensionsTotal": 11, "missing": []
    },
    "method": { "label": "KO/TKO", "share": 70,
                "detail": "70 % des victoires répertoriées de Josh Hokit…" },
    "keyFactors": [ { "title": "Lutte (takedowns)", "text": "…" } ],
    "watchOuts":  [ { "title": "Expérience", "text": "…" } ],
    "model": {
      "version": "voltrix-mma-v1",
      "computedAt": "2026-11-08T14:12:33.000Z",
      "factors": [ { "key": "lutte", "label": "Lutte (takedowns)", "weight": 1.0,
                     "scoreA": 15.1, "scoreB": 84.9, "edge": -35.0 } ],
      "notes": [ "…bornées entre 25 % et 75 %…", "…aucun conseil de paris." ]
    }
  },
  "limitations": [ "…" ],
  "sources":     [ { "name": "ESPN — fiche Ciryl Gane", "url": "https://…", "syncedAt": "…" } ],
  "derivedPending": false
}
```

Règles du pronostic :
- refus explicite (`available=false` + `unavailabilityReason`) si moins de
  3 dimensions comparables — aucune extrapolation ;
- probabilités complémentaires (somme = 100) et bornées [25 % ; 75 %] ;
- `favorite=null` si rencontre statistiquement trop serrée ;
- les pondérations des 11 dimensions sont publiques (champ `model.factors`).

Paramètre `deep=1` : attend le calcul des indicateurs dérivés (frappes
reçues/minute, défenses, temps moyen) avant de répondre — sinon le calcul est
lancé en arrière-plan et `derivedPending=true` invite le client à rappeler.

---

## GET `/api/mma/fighters/[id]`

Fiche complète d'un combattant : informations personnelles, palmarès détaillé,
statistiques de carrière sourcées et datées, indicateurs calculés (fenêtre 10
combats), historique des combats. Une statistique absente chez ESPN reste
`null` (« Non disponible » dans l'interface), jamais estimée.

---

## GET · POST `/api/mma/sync`

- **GET** : état de la synchronisation — compteurs (événements, combats,
  combattants, fiches stats, historique), ordonnanceur automatique
  (événements toutes les 30 min, enrichissement toutes les 6 h), derniers
  journaux (module MMA uniquement depuis la v2.0).
- **POST** : synchronisation manuelle complète. Corps :
  `{ "maxEvents": 2, "maxFighters": 20 }`.

---

## GET `/api/mma/predictions` — NOUVELLE v2.0

**Backtest public du moteur de pronostics** : le modèle est recalculé sur les
combats terminés présents en base et confronté aux vainqueurs réels. Le
résultat est publié tel quel, y compris s'il est défavorable. Affiché dans
l'onglet Paramètres.

```json
{
  "model": "voltrix-mma-v1",
  "analyzed": 46,
  "correct": 33,
  "accuracyPct": 72,
  "byConfidence": [
    { "label": "Bonne",   "analyzed": 38, "correct": 26 },
    { "label": "Moyenne", "analyzed": 8,  "correct": 7 },
    { "label": "Limitée", "analyzed": 0,  "correct": 0 }
  ],
  "fights": [
    { "fightId": "…", "fighterA": "Julian Erosa", "fighterB": "JeongYeong Lee",
      "predictedFavorite": "Julian Erosa", "probability": 62,
      "actualWinner": "Julian Erosa", "correct": true,
      "confidence": "Bonne", "eventName": "UFC Fight Night: …" }
  ],
  "skippedInsufficientData": 32,
  "skippedTooClose": 2,
  "notes": [
    "Biais de recul : les statistiques de carrière utilisées sont celles connues aujourd'hui…",
    "Échantillon : 46 combats terminés départageables…",
    "Les combats jugés trop serrés pour être départagés sont exclus du décompte."
  ]
}
```

Erreurs : `500 { "error": "Backtest indisponible", "detail": "…" }` en cas
d'échec de lecture base.

---

## ~~GET `/api/football/matches`~~ — SUPPRIMÉE v2.0

Route supprimée avec l'ensemble du module football (composant, moteur, table,
journaux, cache). Renvoie désormais **404**. Testé :
`suppression du football : la route /api/football/matches n'existe plus` (pass).

---

## Modèle de pronostics `voltrix-mma-v1` — spécification

| Dimension | Poids | Source |
|---|---|---|
| Forme récente (5 combats) | 1,5 | Historique ESPN |
| Volume de frappes (SLpM) | 1,2 | Stats de carrière ESPN |
| Précision des frappes | 1,2 | Stats de carrière ESPN |
| Frappes absorbées (SApM) | 1,2 | Calcul VOLTRIX (10 derniers combats) |
| Défense contre les frappes | 1,0 | Calcul VOLTRIX (10 derniers combats) |
| Lutte — takedowns / 15 min | 1,0 | Stats de carrière ESPN |
| Défense contre les takedowns | 1,0 | Calcul VOLTRIX (10 derniers combats) |
| Soumissions tentées / 15 min | 0,8 | Stats de carrière ESPN |
| Pouvoir de finition (KO+TKO %) | 1,0 | Stats + palmarès ESPN |
| Expérience (combats disputés) | 0,8 | Palmarès ESPN |
| Envergure physique (allonge) | 0,6 | Fiche ESPN |

Pipeline : indices relatifs 0-100 par dimension → agrégation pondérée →
avantage normalisé ∈ [-1 ; 1] → fonction logistique (pente 2,6) → bornage
[25 % ; 75 %]. Combat trop serré (|p−50| < 6) → « indécis » sans favori.

Engagements : aucune donnée fabriquée ; refus sous 3 dimensions ; pondérations
publiques ; probabilités bornées ; vérification rétrospective affichée sur les
combats terminés ; aucun conseil de paris, aucune cote.

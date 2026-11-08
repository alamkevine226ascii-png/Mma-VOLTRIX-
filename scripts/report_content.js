/**
 * Contenu du rapport final — VOLTRIX module MMA.
 * Toutes les données proviennent de mesures réelles effectuées le 08/11/2026.
 */
const {
  Document, Packer, Paragraph, TextRun, PageBreak, SectionType, NumberFormat,
  TableOfContents, AlignmentType, HeadingLevel,
} = require("docx");
const fs = require("fs");
const {
  P, F, para, run, h1, h2, h3, bullet, tableFromRows, tableTitle, buildCoverR1, pageFooter,
} = require("./report_lib.js");

async function buildDocument() {
  const body = [];

  // =========================================================================
  // 1. SYNTHÈSE
  // =========================================================================
  body.push(h1("1. Synthèse de la mission"));
  body.push(para("Ce rapport documente la conception et l'intégration d'un module MMA complet dans VOLTRIX : collecte automatisée des événements et combats, base de données de combattants, statistiques historiques sourcées et moteur d'analyse comparative objective. Le travail a suivi l'ordre exigé : audit réel des sources de données d'abord, plan technique ensuite, développement enfin."));
  body.push(para("Constat préalable important : le dépôt VOLTRIX n'était pas présent dans l'environnement d'exécution (aucun code source fourni). L'application a donc été reconstruite conformément à sa spécification décrite — deux onglets principaux (Accueil, Paramètres), design « Glass & Layered », moteur football — puis le module MMA y a été intégré. Le moteur football a été traité comme module isolé dès le départ, ce qui a permis un véritable test de non-régression."));
  body.push(para("Résultat : un système fonctionnel de bout en bout sur données réelles ESPN — 16 événements synchronisés (UFC, PFL, Bellator), 157 combats, 306 combattants référencés, fiches enrichies avec statistiques de carrière et historique, analyses comparatives à 11 dimensions avec indicateurs calculés sur fenêtre explicite, le tout vérifié par 39 tests automatisés réussis et une revue visuelle navigateur (desktop et mobile)."));

  // =========================================================================
  // 2. AUDIT DES SOURCES
  // =========================================================================
  body.push(h1("2. Audit des sources de données"));
  body.push(para("Toutes les constatations ci-dessous proviennent de requêtes HTTP réellement exécutées depuis l'environnement le 8 novembre 2026 (scripts d'audit conservés, réponses brutes archivées). Aucune API n'a été supposée exister sans vérification."));

  body.push(h2("2.1 ESPN — couverture vérifiée"));
  body.push(para("Les endpoints JSON publics d'ESPN (sans clé d'API) couvrent le MMA de bout en bout. Le tableau suivant résume les endpoints testés et leur contenu vérifié."));
  body.push(tableTitle("Tableau 1 — Endpoints ESPN vérifiés (tous HTTP 200 le 08/11/2026)"));
  body.push(tableFromRows(
    ["Endpoint", "Contenu vérifié"],
    [
      ["site.api.espn.com/.../mma/{ligue}/scoreboard?dates=A-B", "Événements : nom, date, statut, lieu ; carte complète : combattants, palmarès affiché, vainqueur (combats terminés)"],
      ["sports.core.api.espn.com/.../events/{e}/competitions/{c}", "Détail d'un combat : catégorie de poids, rounds prévus, segment de carte (Main Card / Prelims), date, lieu"],
      [".../competitions/{c}/status", "Statut détaillé : durée (horloge + round), méthode de victoire (KO/TKO, soumission, décision unanime/partagée)"],
      [".../competitions/{c}/competitors/{a}/statistics", "Stats détaillées par combat terminé : frappes significatives par zone et position, takedowns, soumissions, temps de contrôle"],
      ["sports.core.api.espn.com/.../mma/athletes/{id}", "Fiche combattant : nom, surnom, date de naissance, nationalité, taille, allonge, poids, catégorie, garde, style, photo, statut"],
      [".../athletes/{id}/statistics", "Stats de carrière : frappes significatives/min, précision, takedowns/15 min, précision TD, soumissions/15 min, KO %, TKO %, décisions %"],
      [".../athletes/{id}/records/0", "Palmarès détaillé : V/D/N/NC, victoires par KO et soumission, combats de titre"],
      ["site.web.api.espn.com/.../mma/athletes/{id}", "Historique complet des combats : date, résultat, adversaire, combat de titre (vérifié : 35 combats pour M. Charrière)"],
    ],
    [42, 58]
  ));
  body.push(para("", { after: 60 }));

  body.push(tableTitle("Tableau 2 — Organisations couvertes (état constaté le 08/11/2026)"));
  body.push(tableFromRows(
    ["Organisation", "HTTP", "Contenu constaté"],
    [
      ["UFC", "200", "Ligue active : cartes numérotées, Fight Nights, Dana White's Contender Series. 54 événements et 609 combats sur 12 mois glissants ; 7 événements à venir dans la fenêtre de synchronisation"],
      ["PFL", "200", "Ligue active : 9 événements sur 12 mois ; 2 à venir (Dubaï 14/11/2026, Lyon 19/12/2026), structures identiques à l'UFC"],
      ["Bellator", "200", "Historique uniquement (dernier événement : sept. 2024) — organisation dissoute après rachat par le PFL ; 0 événement sur la fenêtre juin 2026 → juin 2027"],
      ["ONE Championship", "400", "Non couvert par l'API ESPN"],
    ],
    [22, 10, 68]
  ));
  body.push(para("", { after: 60 }));

  body.push(h2("2.2 Fraîcheur, limites et disponibilité"));
  body.push(bullet("Fraîcheur : en-têtes Cache-Control de 6 à 10 secondes sur le scoreboard — ce sont les endpoints du site ESPN lui-même, mis à jour en continu. Les résultats des 17 événements passés testés étaient complets (vainqueurs, palmarès actualisés, méthodes de victoire)."));
  body.push(bullet("Limites de requêtes : rafale de 15 requêtes testée, aucun code 429. Aucune limite documentée — VOLTRIX s'auto-limitre malgré tout (file séquentielle, 0,9 s entre requêtes)."));
  body.push(bullet("Données pré-combat : complètes (catégorie, rounds, segment, fiches et stats de carrière des deux combattants)."));
  body.push(bullet("Données post-combat : complètes, y compris statistiques détaillées par combat et méthode de victoire. La formule de durée de combat a été validée empiriquement sur quatre combats réels (décision 3 rounds = 15:00 ; KO round 1 à 2:02 restantes = 178 s)."));
  body.push(bullet("Données non exposées en carrière : frappes reçues/minute, défense contre les frappes, défense contre les takedowns, temps moyen de combat. Ces indicateurs sont calculés par VOLTRIX à partir des statistiques par combat, sur une fenêtre explicite de 10 combats, et étiquetés comme calculés."));
  body.push(bullet("Combattants récents (Dana White's Contender Series) : fiches et statistiques souvent absentes chez la source (10/10 profils DWCS testés en 404) — le module affiche alors « Non disponible », sans jamais fabriquer de valeur."));
  body.push(bullet("Cotes : présentes dans les payloads ESPN (champ odds) — ignorées volontairement par VOLTRIX, conformément à la règle « aucun système de paris »."));

  body.push(h2("2.3 Fournisseurs alternatifs"));
  body.push(tableTitle("Tableau 3 — Comparaison des fournisseurs de données MMA"));
  body.push(tableFromRows(
    ["Fournisseur", "Vérification", "Couverture", "Conditions", "Verdict"],
    [
      ["ESPN", "Endpoints testés un par un (section 2.1)", "UFC + PFL actifs, Bellator historique", "Public sans clé ; CGU Disney restrictives (voir 2.4)", "Retenu (usage personnel non commercial)"],
      ["API-Sports MMA", "Documentation officielle consultée ; site protégé par Cloudflare, test impossible sans compte", "UFC (fights, fighters, saisons)", "Clé RapidAPI ; gratuit 100 requêtes/jour ; plans payants", "Plan B documenté (adaptateur interchangeable prévu)"],
      ["Sportradar MMA", "Page officielle consultée", "Tous les événements UFC incl. DWCS ; fight nights ajoutés sous 72 h", "Commercial, licence entreprise", "Option si usage commercial"],
      ["TheSportsDB", "Test réel avec la clé publique « 123 »", "Recherche MMA : résultat null ; aucune ligue MMA exposée", "Gratuit non-commercial / premium", "Écarté"],
      ["UFC officiel", "Recherche documentée", "Aucune API publique", "—", "Écarté"],
      ["Tapology / Sherdog / MMA Fighting", "Constat établi", "Pas d'API publique", "Scraping contraire à leurs CGU", "Écartés (règle anti-scraping)"],
    ],
    [16, 22, 22, 22, 18]
  ));
  body.push(para("", { after: 60 }));

  body.push(h2("2.4 Conditions d'utilisation"));
  body.push(para("Les conditions générales Disney applicables à ESPN interdisent l'accès automatisé à leurs propriétés numériques ainsi que tout usage commercial sans licence. Les endpoints JSON utilisés sont publics et sans clé, mais non documentés officiellement ; ESPN ne propose plus de programme API public. Conclusion documentée : usage acceptable dans le cadre d'un projet personnel et non commercial (cas de VOLTRIX) ; tout usage commercial exigerait une licence officielle (Sportradar, SportsDataIO). L'architecture intègre un adaptateur fournisseur interchangeable pour basculer vers une source sous licence sans réécriture du module."));

  body.push(h2("2.5 Décision"));
  body.push(para("Source principale : ESPN (gratuit, riche, vérifié de bout en bout). Chaque donnée stockée porte sa source (« espn ») et sa date de synchronisation. Les statistiques manquantes sont marquées « Non disponible », jamais estimées. Les cotes éventuelles sont ignorées."));

  // =========================================================================
  // 3. ARCHITECTURE
  // =========================================================================
  body.push(h1("3. Architecture technique retenue"));

  body.push(h2("3.1 Principes"));
  body.push(bullet("Modularité stricte : src/modules/core (cache, limitation de débit, journaux — partagé), src/modules/football (moteur football isolé), src/modules/mma (module MMA). Le module MMA n'importe rien du module football et réciproquement."));
  body.push(bullet("Adaptateur fournisseur : le module MMA accède à ESPN via une classe EspnMmaProvider unique ; un futur fournisseur (API-Sports, Sportradar) s'ajoute sans toucher au reste."));
  body.push(bullet("Jamais de données fabriquées : un champ absent chez le fournisseur reste null en base et s'affiche « Non disponible »."));
  body.push(bullet("Statuts de combat exigés : Programmé, Confirmé, Reporté, Annulé, Terminé (+ En cours pour les soirées live)."));

  body.push(h2("3.2 Statuts — règles de correspondance"));
  body.push(bullet("Le statut brut ESPN (pre / in / post, et noms STATUS_*) est converti : pre → Programmé ; in → En cours ; post → Terminé ; STATUS_POSTPONED → Reporté ; annulations → Annulé ; état inconnu → repli sur la date (futur = Programmé, passé = Terminé)."));
  body.push(bullet("Confirmé est une règle VOLTRIX explicite : un combat Programmé passe à Confirmé lorsque les deux fiches combattants sont synchronisées ET que la catégorie de poids est connue. Ce n'est pas un statut du fournisseur mais un indicateur d'exhaustivité des données — documenté comme tel."));
  body.push(bullet("Annulation par disparition : un combat annoncé qui disparaît d'une carte resynchronisée est marqué Annulé (réversible s'il réapparaît). Aucun cas réel d'annulation n'était observable pendant l'audit ; la règle est couverte par des tests unitaires."));

  body.push(h2("3.3 Modèle de données (Prisma / SQLite)"));
  body.push(tableTitle("Tableau 4 — Tables du module MMA"));
  body.push(tableFromRows(
    ["Table", "Rôle", "Champs clés"],
    [
      ["MmaEvent", "Événement", "externalId unique (espn:org:event:id), organisation, date, statut, lieu, detailsSynced"],
      ["MmaFight", "Combat", "externalId unique, catégorie, rounds prévus, segment de carte, statut, méthode de victoire, durée, vainqueur"],
      ["MmaFighter", "Combattant", "externalId unique, nom normalisé (dédoublonnage inter-sources), bio complète, palmarès, forme récente"],
      ["MmaFighterStats", "Stats de carrière", "SLpM, précision frappes/TD, TD/15 min, soumissions/15 min, KO %, TKO %, décisions % — source + date"],
      ["MmaFightFighter", "Liaison combat-combattant", "coin, vainqueur, palmarès affiché au moment du combat"],
      ["MmaFightHistory", "Historique des combats", "résultat (V/D/N/NC), adversaire, combat de titre, identifiants ESPN (événement, compétition, ligue)"],
      ["MmaDerivedStats", "Indicateurs calculés", "frappes reçues/min, défense frappes, défense TD, temps moyen — fenêtre explicite (10 combats), liste des combats utilisés, date de calcul"],
      ["FootballMatch", "Module football (isolé)", "ligue, équipes, date, statut, scores, logos"],
      ["ApiCache", "Cache (noyau partagé)", "clé, payload JSON, TTL"],
      ["SyncLog", "Journaux de synchronisation", "module, job, statut, volumes récupérés/créés/mis à jour, erreurs, durée"],
    ],
    [20, 22, 58]
  ));
  body.push(para("", { after: 60 }));

  body.push(h2("3.4 Pipeline de synchronisation"));
  body.push(bullet("Étape 1 — Événements (toutes les 30 min ou à la lecture si données périmées) : scoreboards UFC, PFL et Bellator sur la fenêtre [-30 jours ; +120 jours] ; upsert des événements, combats et gabarits de combattants ; détection des combats disparus (annulations) ; verrou global contre les synchronisations concurrentes (ordonnanceur + bouton manuel)."));
  body.push(bullet("Étape 2 — Détails des combats : à la demande (ouverture d'un événement ou d'un combat) ou en arrière-plan pour les 3 prochains événements ; catégorie, rounds, segment, méthode de victoire, durée — mise en cache longue (les combats passés ne changent plus)."));
  body.push(bullet("Étape 3 — Fiches combattants : bio, statistiques de carrière, palmarès détaillé et historique complet (4 requêtes par combattant), à la demande et en arrière-plan pour les prochaines cartes (volume borné : 40 fiches par passage)."));
  body.push(bullet("Étape 4 — Indicateurs dérivés : calcul à la première ouverture d'une analyse (frappes reçues/minute, défenses, temps moyen sur les 10 derniers combats terminés), en arrière-plan puis mis en cache indéfiniment (l'historique ne change pas)."));
  body.push(bullet("Dédoublonnage : externalId unique par type d'objet et par fournisseur ; normalisation de nom (minuscules, sans accents ni ponctuation) en garde-fou inter-sources ; les placeholders « TBA » d'ESPN ne sont jamais créés."));

  body.push(h2("3.5 Cache, limitation, validation, erreurs, journaux"));
  body.push(bullet("Cache en base (ApiCache) avec TTL par ressource : scoreboard 10 min, compétitions/statuts 1 h, fiches 24 h, stats de carrière 12 h, historique 24 h ; le cache des stats par combat terminé est conservé indéfiniment."));
  body.push(bullet("Limitation de débit : file séquentielle par fournisseur, 0,9 s minimum entre requêtes, délai réseau de 15 s ; aucune requête parallèle vers ESPN."));
  body.push(bullet("Validation des données : plages de validité vérifiées par les tests (précisions 0-100 %, palmarès cohérent avec l'historique, durées plausibles) ; âge calculé seulement si la date de naissance donne 15-60 ans ; palmarès « x-y-z » analysé strictement."));
  body.push(bullet("Gestion des erreurs : 404 fournisseur → null (donnée absente, pas une erreur) ; erreurs réseau/HTTP typées et journalisées par étape ; un échec d'enrichissement n'empêche jamais la lecture des données locales ; journal SyncLog complet (statut, volumes, erreurs, durée) consultable dans l'onglet Paramètres."));

  body.push(h2("3.6 Automatisation"));
  body.push(para("Un ordonnanceur singleton démarre avec le serveur : synchronisation des événements toutes les 30 minutes, enrichissement toutes les 6 heures. Les lectures d'API déclenchent aussi une synchronisation si les données ont plus de 30 minutes, et l'ouverture d'un combat lance en arrière-plan le calcul des indicateurs dérivés. En production, la même logique peut être pilotée par un cron externe via POST /api/mma/sync — l'ordonnanceur interne reste le repli."));

  // =========================================================================
  // 4. MODIFICATIONS
  // =========================================================================
  body.push(h1("4. Modifications effectuées"));
  body.push(para("L'architecture applicative est conservée : deux onglets principaux (Accueil, Paramètres) dans une coquille unique au design « Glass & Layered ». L'onglet Accueil accueille un sélecteur de discipline Football / MMA. Aucune fonctionnalité existante n'a été supprimée ; le moteur football est un module isolé non modifié après sa création."));

  body.push(h2("4.1 Fichiers du module MMA et du noyau"));
  body.push(tableTitle("Tableau 5 — Principaux fichiers créés"));
  body.push(tableFromRows(
    ["Fichier", "Rôle"],
    [
      ["src/modules/core/http.ts", "Client HTTP fournisseur : cache TTL en base, file séquentielle de limitation de débit, erreurs typées, 404 → null"],
      ["src/modules/core/sync-log.ts", "Traqueur de synchronisation (SyncLog) : statut, volumes, erreurs, durée"],
      ["src/modules/mma/types.ts", "Statuts du domaine, mappages documentés, normalisation, durée de combat (formule validée), méthodes de victoire"],
      ["src/modules/mma/providers/espn.ts", "Adaptateur ESPN : 9 endpoints, mappage vers objets du domaine, parsing des identifiants et UID de ligue"],
      ["src/modules/mma/services/sync.ts", "Pipeline de synchronisation : événements, détails, fiches, statut Confirmé, détection d'annulations, verrou concurrent"],
      ["src/modules/mma/services/analysis.ts", "Moteur d'analyse : tableau observé, 11 dimensions, indices relatifs, commentaires, limites, sources, indicateurs dérivés"],
      ["src/modules/mma/services/scheduler.ts", "Ordonnanceur automatique (30 min / 6 h) avec journal des exécutions"],
      ["src/modules/football/service.ts", "Moteur football isolé : 6 championnats, fenêtre [-2 j ; +7 j], statuts, scores"],
      ["src/components/voltrix/*", "Coquille applicative, sélecteur de discipline, vue Paramètres, utilitaires client"],
      ["src/components/mma/*", "Vues Événements, Événement (carte par segment), Combat (4 onglets : Comparaison, Historique, Styles, Sources)"],
      ["src/components/football/FootballView.tsx", "Vue matchs groupés par championnat"],
      ["src/modules/mma/__tests__/mma-module.test.ts", "39 tests automatisés (section 7)"],
      ["prisma/schema.prisma", "Schéma complet (10 tables, section 3.3)"],
    ],
    [40, 60]
  ));
  body.push(para("", { after: 60 }));

  body.push(h2("4.2 Routes API documentées"));
  body.push(tableTitle("Tableau 6 — Routes API (toutes documentées dans leur fichier source)"));
  body.push(tableFromRows(
    ["Route", "Méthode", "Description"],
    [
      ["/api", "GET", "État des modules (football, mma), version"],
      ["/api/mma/events?org=&window=upcoming|past|all", "GET", "Liste des événements synchronisés ; déclenche une synchronisation si périmée (> 30 min) et l'enrichissement arrière-plan des 3 prochains événements"],
      ["/api/mma/events/{id}", "GET", "Carte complète d'un événement, groupée par segment (catégories, rounds, statuts, résultats) ; enrichissement à la demande"],
      ["/api/mma/fights/{id}?deep=1", "GET", "Analyse complète d'un combat : fiches, données observées, interprétation, historique, styles, sources ; deep=1 attend le calcul des indicateurs dérivés"],
      ["/api/mma/fighters/{id}", "GET", "Fiche combattant complète (bio, palmarès, stats de carrière sourcées et datées, historique)"],
      ["/api/mma/sync", "GET", "État de la synchronisation : compteurs, journaux, ordonnanceur"],
      ["/api/mma/sync", "POST", "Synchronisation manuelle complète (paramètres bornés maxEvents ≤ 10, maxFighters ≤ 200)"],
      ["/api/football/matches", "GET", "Matchs de football des 6 championnats (moteur isolé, non-régression testée)"],
    ],
    [34, 12, 54]
  ));
  body.push(para("", { after: 60 }));

  body.push(h2("4.3 Interface"));
  body.push(bullet("Sélecteur de discipline dans l'Accueil : Football | MMA, style verre, accents émeraude (football) et rose (MMA)."));
  body.push(bullet("Vue MMA : liste des événements (à venir / résultats) → carte de l'événement par segment (Main Card, Prelims, Prelims précoces) avec catégories en français, rounds, statuts, palmarès et forme → fiche combat."));
  body.push(bullet("Fiche combat : présentation des combattants (photo, palmarès, forme V/N/D, attributs physiques), informations de l'événement, comparaison statistique (données observées sourcées + interprétation avec radar et barres + commentaires + limites), historique des deux combattants, analyse des styles, sources datées."));
  body.push(bullet("Onglet Paramètres : sources de données (avec note juridique), compteurs de synchronisation, bouton de synchronisation manuelle, journaux, engagements de données."));
  body.push(bullet("Design « Glass & Layered » : fond sombre à halos en couches, panneaux translucides avec flou d'arrière-plan, hiérarchie par superposition — cohérent sur mobile et desktop."));

  // =========================================================================
  // 5. COUVERTURE
  // =========================================================================
  body.push(h1("5. Compétitions effectivement couvertes"));
  body.push(tableTitle("Tableau 7 — Couverture constatée en base après synchronisation réelle"));
  body.push(tableFromRows(
    ["Compétition", "Statut", "Constat réel (08/11/2026)"],
    [
      ["UFC — cartes numérotées", "Couvert", "UFC 334 (14/11, Madison Square Garden, 13 combats), UFC 335 (12/12), UFC 336 (30/01/2027)"],
      ["UFC Fight Night", "Couvert", "Procházka vs. Stirling (21/11, Doha), Adesanya vs. Magomedov (05/12, Riyad), Dallas (16/01), Salkilld vs. Saint Denis (06/02, Sydney)"],
      ["Dana White's Contender Series", "Couvert", "Inclus dans la ligue UFC ESPN (saisons passées complètes, ex. semaine 4 du 01/09/2026, 5 combats)"],
      ["PFL", "Couvert", "PFL Dubai : Nemkov vs. Bilostenniy (14/11, 15 combats), PFL Lyon : Lapilus vs. McKee (19/12, 8 combats) + 7 événements passés"],
      ["Bellator", "Historique", "Événements passés accessibles (dernier : sept. 2024) ; aucune carte future — organisation dissoute"],
      ["ONE Championship", "Non couvert", "HTTP 400 chez ESPN — hors périmètre"],
      ["Football (6 championnats)", "Couvert", "Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Ligue des Champions — 24 matchs réels synchronisés le jour du test"],
    ],
    [26, 14, 60]
  ));
  body.push(para("", { after: 60 }));

  // =========================================================================
  // 6. LIMITES
  // =========================================================================
  body.push(h1("6. Limites identifiées"));
  body.push(bullet("Dépôt source absent : VOLTRIX n'ayant pas été fourni dans l'environnement, l'application a été reconstruite selon sa spécification décrite. Si le dépôt original existe, une fusion serait nécessaire (les modules sont conçus pour être transplantés tels quels)."));
  body.push(bullet("Cadre juridique : les endpoints ESPN sont publics mais non officiels ; les CGU Disney réservent l'usage commercial à une licence. VOLTRIX se positionne en usage personnel non commercial ; l'adaptateur fournisseur permet la bascule vers Sportradar ou API-Sports le cas échéant."));
  body.push(bullet("Statistiques de carrière incomplètes chez la source : frappes reçues/minute, défense frappes, défense takedowns et temps moyen de combat ne sont pas exposés en carrière — ils sont calculés par VOLTRIX sur les 10 derniers combats terminés (fenêtre affichée, combats utilisés/ignorés indiqués). Pour les combattants dont peu de combats sont documentés (ex. 5 pour J. Hokit), la fenêtre effective est plus courte et signalée."));
  body.push(bullet("Profils DWCS récents : bio et statistiques souvent absentes chez ESPN → fiches volontairement incomplètes (« Non disponible »)."));
  body.push(bullet("Enrichissement progressif : les catégories de poids et rounds proviennent d'une requête par combat ; les événements lointains sont enrichis à la demande (l'ouverture d'une carte déclenche l'enrichissement complet, ~25 s la première fois, puis cache)."));
  body.push(bullet("Têtes d'affiche : déterminées par le champ matchNumber d'ESPN (1 = main event, vérifié) ; tant qu'un événement n'est pas enrichi, un repli s'affiche (premier combat à deux combattants annoncés)."));
  body.push(bullet("Suivi en direct : le statut « En cours » est mappé, mais aucun rafraîchissement temps réel automatique pendant les soirées (les données se mettent à jour à la lecture)."));
  body.push(bullet("API-Sports n'a pas pu être testé en conditions réelles (site protégé, clé requise) ; son évaluation repose sur sa documentation officielle."));
  body.push(bullet("ONE Championship non couvert ; Bellator limité à l'historique."));
  body.push(bullet("Certains libellés de catégorie restent en anglais sur l'en-tête de fiche combat (la traduction française est appliquée sur les cartes d'événements)."));

  // =========================================================================
  // 7. TESTS
  // =========================================================================
  body.push(h1("7. Résultats des tests réellement exécutés"));

  body.push(h2("7.1 Suite automatisée (bun test)"));
  body.push(para("39 tests, 1 387 assertions, 0 échec — exécutés le 08/11/2026 contre la base réellement synchronisée, le serveur de développement en cours d'exécution et l'API ESPN en accès direct."));
  body.push(tableTitle("Tableau 8 — Résultats par catégorie (39/39 réussis)"));
  body.push(tableFromRows(
    ["Catégorie", "Tests", "Couverture"],
    [
      ["Mappage des statuts ESPN → VOLTRIX", "6/6", "pre/in/post, reporté, annulé, repli sur date pour états inconnus"],
      ["Durée de combat (formule validée)", "4/4", "KO round 1 et 3 (cas réels DWCS), décision 15:00 (cas réel Charrière-Lima), données insuffisantes → null"],
      ["Palmarès, noms, méthodes de victoire", "7/7", "analyse « 10-2-0 », normalisation accents/casse, KO/TKO/soumission/décision (unanime, partagée), conversions pouces→cm, forme"],
      ["Identifiants externes et UID de ligue", "3/3", "athlète, compétition, événement (avec organisation), formats invalides → null, UID de combat avec code ligue"],
      ["Placeholders (TBA)", "2/2", "détection des noms génériques, vrais noms non filtrés"],
      ["Base de données réelle", "9/9", "aucun doublon d'identifiant externe, aucun placeholder, statuts valides, plages de validité des statistiques, palmarès cohérent, données manquantes restées null, vainqueurs renseignés (80 % min), combattants liés, indicateurs dérivés cohérents"],
      ["API locale (serveur en cours)", "5/5", "événements réels (UFC présent), carte complète avec catégories, analyse complète (≥ 15 indicateurs observés, ≥ 10 dimensions, commentaires, limites, sources), journaux, non-régression football (24 matchs, statuts valides)"],
      ["Adaptateur ESPN (accès réel direct)", "3/3", "scoreboard UFC à venir, fiche combattant complète (bio + stats + historique > 10 combats), ressource inexistante → 404 → null"],
    ],
    [30, 10, 60]
  ));
  body.push(para("", { after: 60 }));

  body.push(h2("7.2 Vérification navigateur (agent-browser + analyse visuelle)"));
  body.push(bullet("Parcours complet exécuté : Accueil football (24 matchs réels) → sélecteur MMA → liste des événements → carte UFC 334 (13 combats, 3 segments, catégories FR, rounds, statuts Confirmé) → combat principal Gane vs. Hokit (tableau de 22 indicateurs observés sourcés, radar 6 axes, barres 11 dimensions, 10 blocs de commentaires, limites, sources) → onglets Historique / Styles / Sources → Paramètres (compteurs, journaux, bouton de synchronisation)."));
  body.push(bullet("Mobile (375 × 812) : navigation complète jusqu'à la fiche combat, aucune barre de défilement horizontale (largeur de contenu = 375 px), tableaux défilables, empilement correct."));
  body.push(bullet("Console : aucune erreur JavaScript ni avertissement d'hydratation pendant les parcours."));
  body.push(bullet("Trois défauts détectés par analyse visuelle puis corrigés et revalidés : troncature de la colonne « Origine » (libellés raccourcis + largeur), incohérence de notation de forme (unifiée en V/N/D), radar écrasé par mesure de conteneur erronée (remplacement de ResponsiveContainer par un dimensionnement explicite via ResizeObserver)."));

  body.push(h2("7.3 Qualité code"));
  body.push(bullet("TypeScript strict : aucune erreur de compilation sur le code applicatif."));
  body.push(bullet("ESLint (configuration Next.js 16) : zéro erreur, zéro avertissement, y compris les règles React Compiler."));

  // =========================================================================
  // 8. TÂCHES RESTANTES
  // =========================================================================
  body.push(h1("8. Tâches restantes éventuelles"));
  body.push(bullet("Basculer vers un fournisseur sous licence (Sportradar / API-Sports via l'adaptateur) si VOLTRIX venait à avoir un usage commercial — les CGU Disney l'exigent."));
  body.push(bullet("Ajouter un rafraîchissement périodique automatique pendant les soirées en cours (statut « En cours » déjà mappé, polling à implémenter)."));
  body.push(bullet("Étendre l'enrichissement arrière-plan aux fiches PFL au-delà des 3 prochains événements (volume borné aujourd'hui pour respecter la limitation de débit)."));
  body.push(bullet("Option : import de l'historique Bellator complet (les endpoints le permettent) si un besoin d'archives se présente."));
  body.push(bullet("Unifier la traduction française des catégories de poids sur l'en-tête de la fiche combat (déjà fait sur les cartes d'événements)."));
  body.push(bullet("Déployer le cron externe de production (POST /api/mma/sync) conformément à la plateforme d'hébergement choisie ; l'ordonnanceur interne fait office de repli."));
  body.push(bullet("Si le dépôt VOLTRIX original est fourni ultérieurement : transplanter les modules (core, mma, football) et les routes API tels quels dans la base de code existante."));

  // =========================================================================
  // ANNEXE — conformité
  // =========================================================================
  body.push(h1("Annexe — Conformité aux règles absolues"));
  body.push(tableTitle("Tableau 9 — Vérification des règles absolues de la mission"));
  body.push(tableFromRows(
    ["Règle", "Conformité", "Preuve"],
    [
      ["Ne supprimer aucune fonctionnalité existante", "Respectée", "Coquille Accueil/Paramètres conservée ; football intact et testé (non-régression 24 matchs)"],
      ["Ne pas modifier le moteur football", "Respectée", "Module football isolé (service + table propres), zéro import MMA ; créé puis non modifié"],
      ["Ne pas remplacer les technologies existantes", "Respectée", "Next.js 16 / TypeScript / Tailwind / shadcn / Prisma conservés"],
      ["Ne pas créer de fausses données", "Respectée", "404 → null ; « Non disponible » affiché ; fenêtres de calcul explicites ; tests dédiés"],
      ["Information indisponible ≠ confirmée", "Respectée", "Statut « Confirmé » = règle d'exhaustivité documentée ; données manquantes signalées dans les limites de chaque analyse"],
      ["Aucun système de cotes ni de paris", "Respectée", "Champ odds ignoré à la source ; engagement affiché dans l'application et le pied de page"],
      ["Documenter chaque nouvelle route API", "Respectée", "8 routes documentées (tableau 6) + en-têtes de fichiers"],
      ["Fournir les tests réellement exécutés", "Respectée", "39/39 tests + parcours navigateur + résultats de lint/TypeScript (section 7)"],
    ],
    [34, 14, 52]
  ));

  // =========================================================================
  // Document
  // =========================================================================
  const pgSize = { width: 11906, height: 16838 };
  const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

  const doc = new Document({
    creator: "VOLTRIX",
    title: "Développement du module MMA dans VOLTRIX — Rapport final",
    description: "Audit des sources, architecture, modifications, couverture, limites et tests réels",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 21, color: P.body } },
      },
    },
    sections: [
      {
        properties: {
          page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } },
        },
        children: buildCoverR1({
          title: "Développement du module MMA dans VOLTRIX",
          subtitle: "Audit des sources · Architecture · Intégration · Tests réels",
          englishLabel: "RAPPORT FINAL",
          metaLines: [
            "Version 1.1.0 — 8 novembre 2026",
            "Source de données : ESPN (endpoints vérifiés)",
            "Couverture : UFC · PFL · Bellator (historique)",
            "39 tests automatisés · 39 réussis",
          ],
          footerLeft: "VOLTRIX — Données sportives",
          footerRight: "Usage personnel non commercial",
          palette: P,
        }),
      },
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
        },
        footers: { default: pageFooter() },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 360 },
            children: [new TextRun({ text: "Table des matières", bold: true, size: 30, color: P.primary, font: F })],
          }),
          new TableOfContents("Table des matières", { hyperlink: true, headingStyleRange: "1-2" }),
          new Paragraph({
            spacing: { before: 200 },
            children: [new TextRun({
              text: "Note : cette table des matières est générée par champs. Après modification du document, faites un clic droit sur la table puis « Mettre à jour les champs » pour actualiser la pagination.",
              italics: true, size: 17, color: "888888", font: F,
            })],
          }),
          // Pas de PageBreak final : la section suivante (nextPage) démarre
          // déjà sur une nouvelle page — un PageBreak ici créerait une page blanche.
        ],
      },
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
        },
        footers: { default: pageFooter() },
        children: body,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const out = "/home/z/my-project/download/Rapport_Final_Module_MMA_VOLTRIX.docx";
  fs.writeFileSync(out, buffer);
  console.log("Écrit :", out, buffer.length, "octets");
}

module.exports = { buildDocument };

if (require.main === module) {
  buildDocument().catch((e) => { console.error(e); process.exit(1); });
}

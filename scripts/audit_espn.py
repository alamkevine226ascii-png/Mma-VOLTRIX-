#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Audit réel des sources de données MMA pour VOLTRIX.
Toutes les requêtes ci-dessous sont réellement exécutées : aucun champ n'est supposé.
Résultats -> /home/z/my-project/scripts/audit_out/ + fixtures brutes -> scripts/fixtures/
"""
import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

OUT = "/home/z/my-project/scripts/audit_out"
FIX = "/home/z/my-project/scripts/fixtures"
os.makedirs(OUT, exist_ok=True)
os.makedirs(FIX, exist_ok=True)

SITE = "https://site.api.espn.com/apis/site/v2/sports/mma"
SITEWEB = "https://site.web.api.espn.com/apis/site/v2/sports/mma"
CORE = "https://sports.core.api.espn.com/v2/sports/mma/leagues"

report = {"generated_at": datetime.now(timezone.utc).isoformat(), "tests": []}


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 VOLTRIX-AUDIT/1.0",
        "Accept": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return {"url": url, "status": r.status, "ms": round((time.time() - t0) * 1000),
                    "headers": {k: v for k, v in r.headers.items() if k.lower() in
                                ("content-type", "cache-control", "date", "server", "x-cache")},
                    "body": body}
    except urllib.error.HTTPError as e:
        try:
            body = e.read()[:600]
        except Exception:
            body = b""
        return {"url": url, "status": e.code, "ms": round((time.time() - t0) * 1000),
                "headers": {}, "body": body, "error": "HTTPError"}
    except Exception as e:
        return {"url": url, "status": None, "ms": round((time.time() - t0) * 1000),
                "headers": {}, "body": b"", "error": str(e)}


def jget(url, name=None, save_fixture=True):
    r = fetch(url)
    r["json"] = None
    if r["status"] == 200:
        try:
            r["json"] = json.loads(r["body"])
        except Exception:
            r["error"] = "JSON invalide"
        if save_fixture and r["json"] is not None and name:
            with open(f"{FIX}/{name}.json", "w", encoding="utf-8") as f:
                json.dump(r["json"], f, ensure_ascii=False)
    r.pop("body", None)
    report["tests"].append({"name": name or url, "status": r["status"], "ms": r["ms"],
                            "url": url, "error": r.get("error")})
    return r


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------
# 1. Ligues couvertes (scoreboard par défaut)
# ---------------------------------------------------------------------------
log("=" * 78)
log("1. COUVERTURE DES ORGANISATIONS (scoreboard par défaut)")
log("=" * 78)
leagues = {}
for lg in ["ufc", "pfl", "bellator", "one", "wsoc"]:  # one/wsoc attendus en échec -> vérification
    r = jget(f"{SITE}/{lg}/scoreboard", name=f"scoreboard_{lg}" if lg in ("ufc", "pfl", "bellator") else None)
    n = len((r["json"] or {}).get("events", [])) if r["json"] else 0
    leagues[lg] = {"http": r["status"], "events": n}
    log(f"  {lg.upper():10s} -> HTTP {r['status']}, events renvoyés: {n}, {r['ms']} ms")

# ---------------------------------------------------------------------------
# 2. UFC : fenêtre à venir (structure d'un événement + combat programmé)
# ---------------------------------------------------------------------------
log("")
log("=" * 78)
log("2. UFC — ÉVÉNEMENTS À VENIR (fenêtre 2026-11-08 -> 2027-03-01)")
log("=" * 78)
r_fut = jget(f"{SITE}/ufc/scoreboard?dates=20261108-20270301", name="ufc_scoreboard_future")
evs = (r_fut["json"] or {}).get("events", [])
log(f"  Événements trouvés: {len(evs)}")
sample_event = None
for e in evs[:12]:
    comps = e.get("competitions", [])
    st = (e.get("status") or {}).get("type", {}).get("state", "?")
    venue = ((e.get("competitions") or [{}])[0].get("venue") or {})
    vname = venue.get("fullName")
    city = (venue.get("address") or {}).get("city"), (venue.get("address") or {}).get("country")
    log(f"  - [{e.get('id')}] {e.get('name')} | {e.get('date')} | etat={st} | "
        f"combats={len(comps)} | lieu={vname} {city[0] or ''} {city[1] or ''}")
if evs:
    sample_event = evs[0]

# Structure d'un combat programmé
if sample_event:
    log("")
    log("  Structure du 1er combat (compétition) de l'événement échantillon :")
    c0 = (sample_event.get("competitions") or [{}])[0]
    log(f"   clés compétition: {sorted(c0.keys())}")
    for comp in (c0.get("competitors") or []):
        ath = comp.get("athlete") or {}
        rec = comp.get("records") or ath.get("records") or []
        log(f"   combattant: id={ath.get('id')} nom={ath.get('displayName')} "
            f"records={json.dumps(rec, ensure_ascii=False)[:120]}")
        log(f"     clés competitor: {sorted(comp.keys())}")

# ---------------------------------------------------------------------------
# 3. UFC : fenêtre passée (résultats réellement disponibles ?)
# ---------------------------------------------------------------------------
log("")
log("=" * 78)
log("3. UFC — ÉVÉNEMENTS PASSÉS (fenêtre 2026-09-01 -> 2026-11-07) : résultats ?")
log("=" * 78)
r_past = jget(f"{SITE}/ufc/scoreboard?dates=20260901-20261107", name="ufc_scoreboard_past")
evs_p = (r_past["json"] or {}).get("events", [])
log(f"  Événements trouvés: {len(evs_p)}")
completed_fight = None
for e in evs_p[:8]:
    comps = e.get("competitions", [])
    done = sum(1 for c in comps if (c.get("status") or {}).get("type", {}).get("completed"))
    log(f"  - [{e.get('id')}] {e.get('name')} | {e.get('date')} | combats={len(comps)} | terminés={done}")
for e in evs_p:
    for c in e.get("competitions", []):
        if (c.get("status") or {}).get("type", {}).get("completed"):
            completed_fight = (e, c)
            break
    if completed_fight:
        break
if completed_fight:
    e, c = completed_fight
    log(f"  Exemple de combat terminé (résultats présents ?) : {e.get('name')}")
    for comp in c.get("competitors", []):
        ath = comp.get("athlete") or {}
        log(f"   {ath.get('displayName')}: winner={comp.get('winner')} "
            f"records={json.dumps(comp.get('records') or [], ensure_ascii=False)[:150]}")
    log(f"   clés status: {json.dumps(c.get('status'), ensure_ascii=False)[:200]}")
    log(f"   détails/notes présents: {json.dumps(c.get('details') or c.get('notes') or [], ensure_ascii=False)[:200]}")

# ---------------------------------------------------------------------------
# 4. Détail d'événement (summary) + fiche combattant
# ---------------------------------------------------------------------------
log("")
log("=" * 78)
log("4. DÉTAIL ÉVÉNEMENT & FICHE COMBATTANT")
log("=" * 78)
if sample_event:
    eid = sample_event.get("id")
    r_sum = jget(f"{SITEWEB}/ufc/summary?event={eid}", name="ufc_event_summary")
    j = r_sum["json"] or {}
    log(f"  summary event {eid} -> HTTP {r_sum['status']}, clés racine: {sorted(j.keys())}")
    box = j.get("boxscore") or {}
    log(f"  boxscore.clés: {sorted(box.keys()) if isinstance(box, dict) else type(box)}")
    for k in ("taleOfTape", "athletes", "fighters", "stats"):
        for root_name, root in (("racine", j), ("boxscore", box)):
            if isinstance(root, dict) and k in root:
                log(f"  {root_name}.{k} présent: {json.dumps(root[k], ensure_ascii=False)[:300]}")

# Fiche combattant : on prend un id depuis le scoreboard futur, sinon un id passé
fighter_ids = []
for src in (evs, evs_p):
    for e in src:
        for c in e.get("competitions", []):
            for comp in c.get("competitors", []):
                aid = (comp.get("athlete") or {}).get("id")
                if aid:
                    fighter_ids.append(aid)
    if fighter_ids:
        break
if fighter_ids:
    fid = fighter_ids[0]
    log(f"  Fiche combattant ESPN (athlète id={fid}) :")
    r_ath = jget(f"{SITE}/ufc/athletes/{fid}", name="ufc_athlete")
    a = r_ath["json"] or {}
    log(f"   HTTP {r_ath['status']}, clés racine: {sorted(a.keys())}")
    for k in ("height", "weight", "reach", "stance", "birthDate", "nationality", "flag",
              "record", "fights", "statistics", "stats", "careerStats", "bio"):
        if k in a:
            v = a[k]
            s = json.dumps(v, ensure_ascii=False)
            log(f"   - {k}: {s[:220]}")
    # API core
    r_core = jget(f"{CORE}/ufc/athletes/{fid}", name=None, save_fixture=False)
    cj = r_core["json"] or {}
    log(f"  CORE athletes/{fid} -> HTTP {r_core['status']}, clés: {sorted(cj.keys())[:25]}")
    # stats core par saison
    for season in ("2026", "2025"):
        r_st = jget(f"{CORE}/ufc/seasons/{season}/athletes/{fid}/statistics", name=None, save_fixture=False)
        log(f"  CORE seasons/{season}/athletes/{fid}/statistics -> HTTP {r_st['status']}")
        if r_st["status"] == 200:
            break

# ---------------------------------------------------------------------------
# 5. Fraîcheur / mise à jour : re-fetch du scoreboard à 5 s d'intervalle
# ---------------------------------------------------------------------------
log("")
log("=" * 78)
log("5. FRAÎCHEUR — DOUBLE REQUÊTE À 5 s D'ÉCART (headers de cache)")
log("=" * 78)
r_a = fetch(f"{SITE}/ufc/scoreboard")
time.sleep(5)
r_b = fetch(f"{SITE}/ufc/scoreboard")
for tag, rr in (("1re", r_a), ("2e", r_b)):
    log(f"  {tag} requête: HTTP {rr['status']}, {rr['ms']} ms, headers={rr['headers']}")

# ---------------------------------------------------------------------------
# 6. Tolérance rafale (15 requêtes rapides) — détection de limitation
# ---------------------------------------------------------------------------
log("")
log("=" * 78)
log("6. LIMITES DE REQUÊTES — RAFALE DE 15 REQUÊTES")
log("=" * 78)
codes = []
for i in range(15):
    rr = fetch(f"{SITE}/ufc/scoreboard")
    codes.append(rr["status"])
    time.sleep(0.25)
log(f"  codes HTTP: {codes}")
log(f"  429 (trop de requêtes): {codes.count(429)} / 15")

# ---------------------------------------------------------------------------
# 7. Bilan machine
# ---------------------------------------------------------------------------
with open(f"{OUT}/audit_espn.json", "w", encoding="utf-8") as f:
    json.dump({"report": report, "leagues": leagues,
               "upcoming_events": len(evs), "past_events": len(evs_p)}, f, ensure_ascii=False, indent=2)
log("")
log(f"Bilan écrit dans {OUT}/audit_espn.json ; fixtures brutes dans {FIX}/")

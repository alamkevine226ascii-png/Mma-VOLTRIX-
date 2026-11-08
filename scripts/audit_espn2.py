#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audit ESPN MMA — phase 2 : fiche combattant, détail combat, PFL/Bellator, stats."""
import json
import os
import urllib.request
import urllib.error

FIX = "/home/z/my-project/scripts/fixtures"
SITE = "https://site.api.espn.com/apis/site/v2/sports/mma"
CORE = "https://sports.core.api.espn.com/v2/sports/mma/leagues"


def jget(url, name=None):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VOLTRIX-AUDIT/1.0",
                                                   "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read()
            j = json.loads(body)
            if name:
                with open(f"{FIX}/{name}.json", "w", encoding="utf-8") as f:
                    json.dump(j, f, ensure_ascii=False)
            return r.status, j
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return None, str(e)


def log(*a):
    print(*a, flush=True)


fid = "5037883"  # Evan Elder, tiré du scoreboard réel
eid = "600061400"  # UFC 334
comp = None
with open(f"{FIX}/ufc_scoreboard_future.json") as f:
    d = json.load(f)
for c in d["events"][0]["competitions"]:
    comp = c["id"]
    break

log("# A. FICHE COMBATTANT — endpoints candidats")
for url, nm in [
    (f"{SITE}/ufc/athletes/{fid}", "ufc_athlete"),
    (f"{CORE}/ufc/athletes/{fid}", "core_athlete"),
]:
    st, j = jget(url, nm)
    log(f"  {url} -> HTTP {st}")
    if st == 200 and isinstance(j, dict):
        log(f"    clés: {sorted(j.keys())}")

log("")
log("# B. STATS COMBATTANT — endpoints candidats (core)")
for season in ("2026", "2025", "2024"):
    for typ in ("0", "1", "2"):
        url = f"{CORE}/ufc/seasons/{season}/types/{typ}/athletes/{fid}/statistics"
        st, j = jget(url, None)
        if st == 200:
            log(f"  {url} -> HTTP 200  (saison={season}, type={typ})")
            log(f"    clés: {sorted(j.keys())[:20]}")
        else:
            log(f"  {url} -> HTTP {st}")

log("")
log("# C. DÉTAIL COMBAT / ÉVÉNEMENT — endpoints candidats")
for url in [
    f"{SITE}/ufc/events/{eid}",
    f"{SITE}/ufc/scoreboard/{eid}",
    f"{CORE}/ufc/events/{eid}",
    f"{CORE}/ufc/seasons/2026/events/{eid}",
]:
    st, j = jget(url, None)
    log(f"  {url} -> HTTP {st}")
    if st == 200 and isinstance(j, dict):
        log(f"    clés: {sorted(j.keys())[:20]}")

log("")
log("# D. CORE COMPETITION (combat individuel, id lu dans le scoreboard)")
st, j = jget(f"{CORE}/ufc/events/{eid}/competitions/{comp}", None)
log(f"  {CORE}/ufc/events/{eid}/competitions/{comp} -> HTTP {st}")
if st == 200 and isinstance(j, dict):
    log(f"    clés: {sorted(j.keys())[:25]}")

log("")
log("# E. CONTENU PFL / BELLATOR (événement renvoyé par défaut)")
for lg in ("pfl", "bellator"):
    st, j = jget(f"{SITE}/{lg}/scoreboard", None)
    if st == 200 and j:
        evs = j.get("events", [])
        for e in evs[:3]:
            stt = (e.get("status") or {}).get("type", {}).get("state")
            log(f"  {lg.upper()}: [{e.get('id')}] {e.get('name')} | {e.get('date')} | etat={stt} | combats={len(e.get('competitions', []))}")
    else:
        log(f"  {lg.upper()}: HTTP {st}")

log("")
log("# F. FENÊTRES ÉTENDUES PFL / BELLATOR")
for lg in ("pfl", "bellator"):
    st, j = jget(f"{SITE}/{lg}/scoreboard?dates=20260601-20270601", None)
    if st == 200 and j:
        evs = j.get("events", [])
        log(f"  {lg.upper()} (juin 2026 -> juin 2027): {len(evs)} événements")
        for e in evs[:6]:
            stt = (e.get("status") or {}).get("type", {}).get("state")
            log(f"    - [{e.get('id')}] {e.get('name')} | {e.get('date')} | etat={stt}")
    else:
        log(f"  {lg.upper()}: HTTP {st}")

log("")
log("# G. UFC — FENÊTRE LARGE 12 MOIS (volumétrie totale)")
st, j = jget(f"{SITE}/ufc/scoreboard?dates=20251101-20261108", None)
if st == 200 and j:
    evs = j.get("events", [])
    log(f"  UFC (nov 2025 -> nov 2026): {len(evs)} événements")
    total_fights = sum(len(e.get("competitions", [])) for e in evs)
    log(f"  total combats sur la période: {total_fights}")

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audit ESPN MMA — phase 3 : disponibilité des statistics et eventLog."""
import json
import urllib.request
import urllib.error

FIX = "/home/z/my-project/scripts/fixtures"
CORE = "https://sports.core.api.espn.com/v2/sports/mma"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "VOLTRIX-AUDIT/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return None, str(e)


d = json.load(open(f"{FIX}/ufc_scoreboard_past.json"))
# combattants des MAIN EVENTS (competitors avec order 1/2 du 1er combat = main event)
main_event_ids = {}
for e in d.get("events", [])[:8]:
    comps = e.get("competitions", [])
    if not comps:
        continue
    for comp in comps[0].get("competitors", []):
        nm = (comp.get("athlete") or {}).get("displayName")
        if nm and comp.get("id"):
            main_event_ids[comp["id"]] = f"{nm} ({e.get('shortName') or e.get('name')})"

print(f"Combattants de main events testés : {len(main_event_ids)}")
ok, ko = 0, 0
sample_stats = None
for fid, label in list(main_event_ids.items())[:10]:
    st, j = get(f"{CORE}/leagues/ufc/athletes/{fid}/statistics?lang=en&region=us")
    if st == 200 and isinstance(j, dict):
        ok += 1
        if sample_stats is None:
            sample_stats = (fid, label, j)
        n = len(j.get("splits", {}).get("categories", [])) if j.get("splits") else 0
        print(f"  OK  {label} id={fid} -> catégories stats: {n}")
    else:
        ko += 1
        print(f"  404 {label} id={fid} -> HTTP {st}")
print(f"\nDisponibilité statistics : {ok}/{ok+ko}")

if sample_stats:
    fid, label, j = sample_stats
    json.dump(j, open(f"{FIX}/core_athlete_statistics.json", "w"), ensure_ascii=False)
    print(f"\n=== EXEMPLE COMPLET : {label} (id={fid}) ===")
    splits = j.get("splits") or {}
    for c in splits.get("categories", []):
        print(f"\n[{c.get('displayName')}]")
        for st in c.get("stats", []):
            print(f"   {st.get('name')}: {st.get('displayValue')} (value={st.get('value')})")

# eventLog pour ce même combattant
if sample_stats:
    fid = sample_stats[0]
    st, j = get(f"{CORE}/athletes/{fid}/eventlog?lang=en&region=us")
    print(f"\n=== EVENTLOG {fid} -> HTTP {st} ===")
    if st == 200 and isinstance(j, dict):
        json.dump(j, open(f"{FIX}/core_athlete_eventlog.json", "w"), ensure_ascii=False)
        print("clés:", sorted(j.keys()))
        items = (j.get("events") or {}).get("items", [])
        print("nb entrées historique:", len(items))
        if items:
            it = items[0].get("event") or items[0]
            print("1re entrée:", json.dumps(it, ensure_ascii=False)[:400])

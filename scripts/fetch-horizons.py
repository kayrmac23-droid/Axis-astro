#!/usr/bin/env python3
"""Fetch JPL Horizons DE440 geocentric ecliptic longitude for Pluto on benchmark dates."""
import json
import re
import urllib.parse
import urllib.request

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

# Existing Meeus values from BENCHMARK.md (computed from full 43-term astronomia/pluto)
DATES = [
    (1930,  6, 15, 109.4315, "Near discovery"),
    (1945,  1,  1, 130.4992, ""),
    (1960,  7,  1, 154.6780, ""),
    (1975,  3, 15, 188.6269, ""),
    (1990,  9,  1, 225.4961, "Post-perihelion"),
    (2000,  1,  1, 251.4611, "J2000 epoch"),
    (2010,  6, 21, 274.0648, "Summer solstice"),
    (2020,  1, 12, 292.5039, "Saturn–Pluto conjunction"),
    (2025,  3, 20, 303.0048, "Spring equinox"),
]

def fetch_lon(year, month, day):
    start = f"{year}-{MONTHS[month-1]}-{day:02d} 12:00"
    stop  = f"{year}-{MONTHS[month-1]}-{day:02d} 12:01"
    params = {
        "format":     "json",
        "COMMAND":    "'999'",
        "OBJ_DATA":   "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER":     "'500@399'",
        "START_TIME": f"'{start}'",
        "STOP_TIME":  f"'{stop}'",
        "STEP_SIZE":  "'1m'",
        "QUANTITIES": "'31'",
        "ANG_FORMAT": "DEG",
        "APPARENT":   "AIRLESS",
        "CAL_FORMAT": "CAL",
    }
    url = HORIZONS_URL + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    text = data.get("result", "")
    soe = text.find("$$SOE")
    eoe = text.find("$$EOE")
    if soe == -1 or eoe == -1:
        return None, None
    block = text[soe+5:eoe].strip()
    first = block.split("\n")[0].strip()
    floats = re.findall(r"-?\d+\.\d+", first)
    if len(floats) < 2:
        return None, None
    # Apparent geocentric ecliptic longitude is the second-to-last decimal,
    # latitude is the last. Same convention as src/lib/jpl-horizons.ts.
    lon = float(floats[-2])
    lat = float(floats[-1])
    m = re.search(r"\bDE(\d+)\b", text)
    ephem = f"DE{m.group(1)}" if m else "DE440"
    return lon, ephem

results = []
for y, m, d, meeus, ctx in DATES:
    try:
        lon, ephem = fetch_lon(y, m, d)
        if lon is None:
            results.append((y, m, d, meeus, ctx, None, None, None))
            continue
        # Δ in arcminutes (Meeus - JPL). Wrap the residual to [-180, 180].
        delta = meeus - lon
        if delta >  180: delta -= 360
        if delta < -180: delta += 360
        delta_arcmin = delta * 60.0
        results.append((y, m, d, meeus, ctx, lon, ephem, delta_arcmin))
        print(f"{y}-{m:02d}-{d:02d}: Meeus={meeus:.4f}°  JPL={lon:.4f}°  Δ={delta_arcmin:+.1f}'  ({ephem})")
    except Exception as e:
        print(f"{y}-{m:02d}-{d:02d}: FAILED — {e}")
        results.append((y, m, d, meeus, ctx, None, None, None))

# Emit a Markdown table row for each
print("\n=== Markdown table rows ===")
for y, m, d, meeus, ctx, lon, ephem, delta in results:
    date_str = f"{y}-{m:02d}-{d:02d}"
    ctx_str = ctx if ctx else ""
    if lon is None:
        print(f"| {date_str} | {ctx_str} | {meeus:.4f} | — | — |")
    else:
        sign = "+" if delta >= 0 else ""
        print(f"| {date_str} | {ctx_str} | {meeus:.4f} | {lon:.4f} | {sign}{delta:.1f} |")

#!/usr/bin/env python3
"""Stáhne soupisky a rozlosování z chess-results.com do data/competitions.json.

Spouští se automaticky každý pátek (GitHub Actions), jde ale spustit i ručně:

    pip install -r scripts/requirements.txt
    python scripts/fetch_data.py [--save-html raw]

Zdroj: stránky turnajů na chess-results.com (soupisky: art=8, rozlosování: art=2).
Stahuje se jen pár stránek jednou týdně, mezi požadavky je pauza.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "scripts" / "competitions.json"
OUT = ROOT / "data" / "competitions.json"

URL = "https://chess-results.com/tnr{tnr}.aspx"
UA = "zapis-o-utkani/1.0 (+https://github.com/slivam24/zapis-o-utkani; tydenni stahovani soupisek)"

# Sloupec "Rtg" na chess-results je v českých soutěžích národní rating (LOK).
# Jsou-li na stránce i sloupce RtgN / RtgI, použijí se podle názvu.
PLAIN_RTG_IS = "nat"

TEAM_RE = re.compile(r"^\s*(\d+)\.\s+(.*)\s+\((?:Rtg|Elo|Ø)[^)]*\)\s*(?:Kapit\S*:\s*(.*))?$", re.I | re.S)
TYPE_RE = re.compile(r"^(?:Z|K|ZK|H|V|C)(?:\s*,\s*(?:Z|K|ZK|H|V|C))*$")
# Hlavička kola na chess-results: "1. Kolo Datum kola 2026/10/18 Hodina 10:00".
# Číslo bývá před slovem Kolo, u jiných jazyků za ním, proto dva výrazy.
ROUND_RE = re.compile(r"^\s*(\d{1,2})\s*\.\s*(?:kolo|round|runde|rd)\b", re.I)
ROUND_ALT_RE = re.compile(r"^\s*(?:kolo|round|runde)\s+(\d{1,2})\b", re.I)
TIME_RE = re.compile(r"\b(\d{1,2}):(\d{2})\b")
DATE_RE = re.compile(r"(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})|(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})")


def clean(s: str) -> str:
    return " ".join((s or "").split())


def norm(s: str) -> str:
    return re.sub(r"[\s\"'“”„]+", "", s or "").casefold()


# ---------------------------------------------------------------- stahování

def fetch(session: requests.Session, tnr: int, art: int, retries: int = 3) -> str:
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            res = session.get(URL.format(tnr=tnr), params={"lan": 5, "art": art, "zeilen": 0}, timeout=45)
            res.raise_for_status()
            res.encoding = res.encoding or "utf-8"
            return res.text
        except requests.RequestException as e:  # noqa: PERF203
            last = e
            print(f"  ! pokus {attempt}/{retries} selhal: {e}", file=sys.stderr)
            time.sleep(3 * attempt)
    raise RuntimeError(f"Nepodařilo se stáhnout tnr{tnr} art={art}: {last}")


# ---------------------------------------------------------------- soupisky

def header_map(cells: list[str]) -> dict[str, int] | None:
    """Z řádku záhlaví vytvoří mapu sloupců. Vrací None, pokud to záhlaví není."""
    low = [clean(c).casefold() for c in cells]
    if not any(c in ("jméno", "name") for c in low) or not any(c.startswith("rtg") for c in low):
        return None
    m: dict[str, int] = {}
    for i, c in enumerate(low):
        c2 = c.replace(" ", "")
        if c2 in ("šach.", "šach", "bd.", "bd", "sach."):
            m["no"] = i
        elif c2 in ("jméno", "name"):
            m["name"] = i
        elif c2 in ("rtgn", "nrtg"):
            m["nat"] = i
        elif c2 in ("rtgi", "irtg", "fide"):
            m["fide"] = i
        elif c2 == "rtg":
            m["rtg"] = i
        elif c2 == "fed":
            m["fed"] = i
        elif c2 in ("typ", "type"):
            m["type"] = i
    return m if "name" in m else None


def to_int(s: str) -> int | None:
    s = clean(s)
    return int(s) if re.fullmatch(r"\d{1,4}", s) else None


def parse_types(raw: str) -> list[str]:
    return [t.strip().upper() for t in re.split(r"[,\s/]+", raw or "") if t.strip() and t.strip().upper() != "Z"]


def player_from_cells(cells: list[str], links: list[str], hm: dict[str, int] | None) -> dict | None:
    no = to_int(cells[0]) if cells else None
    if no is None:
        return None
    name = ""
    if hm and hm.get("name") is not None and hm["name"] < len(cells) and "," in cells[hm["name"]]:
        name = cells[hm["name"]]
    else:
        name = next((l for l in links if "," in l), "") or next((c for c in cells if "," in c and not c.isdigit()), "")
    name = clean(name)
    if not name:
        return None

    def col(key: str) -> str:
        i = (hm or {}).get(key)
        return cells[i] if i is not None and i < len(cells) else ""

    rtg = to_int(col("rtg"))
    nat = to_int(col("nat"))
    fide = to_int(col("fide"))
    if not hm:  # nouzově: první čtyřčíslí za jménem
        idx = next((i for i, c in enumerate(cells) if clean(c) == name), -1)
        for c in cells[idx + 1 :]:
            v = to_int(c)
            if v is not None and (v == 0 or 600 <= v <= 3000):
                rtg = v
                break
    if rtg is not None:
        if PLAIN_RTG_IS == "fide" and fide is None:
            fide = rtg
        elif nat is None:
            nat = rtg
    raw_type = col("type")
    if not hm:
        raw_type = next((c for c in cells if TYPE_RE.match(clean(c))), "")
    types = parse_types(raw_type)
    return {
        "no": no,
        "name": name,
        "types": types,
        "nat": nat if nat and nat > 0 else None,
        "fide": fide if fide and fide > 0 else None,
    }


def parse_rosters(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    teams: list[dict] = []
    cur: dict | None = None
    hm: dict[str, int] | None = None
    for tr in soup.find_all("tr"):
        tds = tr.find_all(["td", "th"], recursive=False)
        if not tds:
            continue
        cells = [clean(td.get_text(" ")) for td in tds]
        text = clean(" ".join(c for c in cells if c))

        m = TEAM_RE.match(text) if len([c for c in cells if c]) <= 3 else None
        if m:
            captain = clean((m.group(3) or "").split(",")[0])
            cur = {"name": clean(m.group(2)), "captain": captain, "players": []}
            teams.append(cur)
            hm = None
            continue
        h = header_map(cells)
        if h:
            hm = h
            continue
        if cur is None:
            continue
        links = [clean(a.get_text(" ")) for a in tr.find_all("a")]
        p = player_from_cells(cells, links, hm)
        if p:
            cur["players"].append(p)
    return teams


# ---------------------------------------------------------------- rozlosování

def parse_date(text: str) -> str | None:
    m = DATE_RE.search(text)
    if not m:
        return None
    try:
        if m.group(1):
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        return dt.date(int(m.group(6)), int(m.group(5)), int(m.group(4))).isoformat()
    except ValueError:
        return None


def round_header(nonempty: list[str]) -> re.Match | None:
    """Řádek je hlavička kola jen tehdy, má-li jedinou krátkou buňku se správným tvarem.

    Tím se vyloučí navigační řádek 'Nasazení hráčů | Kolo.1' i vnořené tabulky,
    v nichž je text celé stránky v jedné buňce.
    """
    if len(nonempty) != 1 or len(nonempty[0]) > 120:
        return None
    return ROUND_RE.match(nonempty[0]) or ROUND_ALT_RE.match(nonempty[0])


def parse_rounds(html: str, team_names: list[str]) -> list[dict]:
    by_norm = {norm(n): n for n in team_names}
    soup = BeautifulSoup(html, "html.parser")
    rounds: list[dict] = []
    cur: dict | None = None
    for tr in soup.find_all("tr"):
        tds = tr.find_all(["td", "th"], recursive=False)
        if not tds:
            continue
        cells = [clean(td.get_text(" ")) for td in tds]
        nonempty = [c for c in cells if c]
        if not nonempty:
            continue

        rm = round_header(nonempty)
        if rm:
            text = nonempty[0]
            tm = TIME_RE.search(text)
            cur = {
                "no": int(rm.group(1)),
                "date": parse_date(text),
                "time": f"{int(tm.group(1)):02d}:{tm.group(2)}" if tm else None,
                "matches": [],
            }
            rounds.append(cur)
            continue

        if cur is None:
            continue
        found = [by_norm[norm(c)] for c in cells if norm(c) in by_norm]
        if len(found) >= 2:
            cur["matches"].append({"home": found[0], "away": found[1]})
    return [r for r in rounds if r["matches"]]


# ---------------------------------------------------------------- hlavní běh

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--save-html", metavar="DIR", help="uloží stažené stránky (pro ladění)")
    ap.add_argument(
        "--only",
        metavar="ID",
        help="stáhne jen tuhle soutěž, u ostatních ponechá dosavadní data (šetří dotazy na server)",
    )
    args = ap.parse_args()

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    previous = {}
    if OUT.exists():
        try:
            previous = {c["id"]: c for c in json.loads(OUT.read_text(encoding="utf-8"))["competitions"]}
        except (ValueError, KeyError):
            previous = {}
    raw_dir = pathlib.Path(args.save_html) if args.save_html else None
    if raw_dir:
        raw_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "cs,en;q=0.7"})

    if args.only and not any(c["id"] == args.only for c in cfg["competitions"]):
        print(f"Soutěž {args.only} není v nastavení.", file=sys.stderr)
        return 1

    comps = []
    ok = 0
    for c in cfg["competitions"]:
        comp = dict(c)
        comp["season"] = c.get("season") or cfg["season"]
        comp["url"] = f"https://chess-results.com/tnr{c['tnr']}.aspx?lan=5"
        old = previous.get(c["id"], {})
        if args.only and c["id"] != args.only:
            comp["teams"] = old.get("teams", [])
            comp["rounds"] = old.get("rounds", [])
            comps.append(comp)
            ok += 1 if comp["teams"] else 0
            continue
        print(f"{c['short']} (tnr{c['tnr']})")
        try:
            html_r = fetch(session, c["tnr"], 8)
            if raw_dir:
                (raw_dir / f"{c['id']}_art8.html").write_text(html_r, encoding="utf-8")
            teams = parse_rosters(html_r)
            time.sleep(2)
            html_l = fetch(session, c["tnr"], 2)
            if raw_dir:
                (raw_dir / f"{c['id']}_art2.html").write_text(html_l, encoding="utf-8")
            rounds = parse_rounds(html_l, [t["name"] for t in teams]) if teams else []
            time.sleep(2)
        except RuntimeError as e:
            print(f"  ! {e}", file=sys.stderr)
            teams, rounds = [], []

        teams = [t for t in teams if t["players"]]
        if len(teams) < 2:
            print("  ! soupisky nenalezeny, ponechávám předchozí data", file=sys.stderr)
            teams = old.get("teams", [])
            rounds = old.get("rounds", [])
        else:
            ok += 1
            short = [t["name"] for t in teams if len(t["players"]) < c["boards"]]
            if short:
                print(f"  ! méně hráčů než šachovnic: {short}", file=sys.stderr)
            if not rounds:
                print("  ! rozlosování nenalezeno, ponechávám předchozí", file=sys.stderr)
                rounds = old.get("rounds", [])
        comp["teams"] = teams
        comp["rounds"] = rounds
        print(f"  družstev: {len(teams)}, hráčů: {sum(len(t['players']) for t in teams)}, kol: {len(rounds)}")
        comps.append(comp)

    if ok == 0:
        print("Nepodařilo se načíst žádnou soutěž.", file=sys.stderr)
        return 1

    body = {"season": cfg["season"], "competitions": comps}
    old_body = {"season": None}
    if OUT.exists():
        try:
            old_json = json.loads(OUT.read_text(encoding="utf-8"))
            old_body = {"season": old_json.get("season"), "competitions": old_json.get("competitions")}
        except ValueError:
            pass
    if old_body == body:
        print("Beze změn, soubor se nepřepisuje.")
        return 0
    out = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "chess-results.com",
        **body,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Zapsáno {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

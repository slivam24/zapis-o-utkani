#!/usr/bin/env python3
"""Přidá soutěž z chess-results.com do scripts/competitions.json.

Volá se buď ručně:

    python scripts/add_competition.py --url https://chess-results.com/tnr1507857.aspx --boards 8

nebo z hlášení založeného podle šablony "Přidat soutěž" (text hlášení v proměnné ISSUE_BODY):

    python scripts/add_competition.py --from-issue

Na výstup píše zprávu v markdownu, kterou úloha vloží jako odpověď do hlášení.
Návratové kódy: 0 přidáno, 1 chyba k nahlášení, 2 nejde o žádost o soutěž (mlčky ignorovat).
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import fetch_data as fd  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "scripts" / "competitions.json"

MAX_COMPETITIONS = 60
MIN_BOARDS, MAX_BOARDS = 2, 16

URL_RE = re.compile(r"^https?://(?:[a-z0-9-]+\.)?chess-results\.com/tnr(\d{1,9})\.aspx", re.I)
SEASON_RE = re.compile(r"\b(20\d{2})\s*/\s*(20\d{2}|\d{2})\s*$")
NO_RESPONSE = {"_no response_", "_bez odpovědi_", "", "-"}


class Refused(Exception):
    """Žádost nelze splnit, důvod je určený uživateli."""


def parse_tournament_url(raw: str) -> int:
    """Z odkazu vytáhne číslo turnaje. Odmítne cokoli mimo chess-results.com."""
    url = (raw or "").strip().strip("<>").split()[0] if (raw or "").strip() else ""
    m = URL_RE.match(url)
    if not m:
        raise Refused(
            "Odkaz nevede na turnaj na chess-results.com. "
            "Čekám adresu ve tvaru `https://chess-results.com/tnr1507857.aspx`."
        )
    return int(m.group(1))


def parse_boards(raw: str) -> int:
    m = re.search(r"\d{1,2}", raw or "")
    if not m:
        raise Refused("Nerozumím počtu šachovnic.")
    n = int(m.group())
    if not MIN_BOARDS <= n <= MAX_BOARDS:
        raise Refused(f"Počet šachovnic musí být mezi {MIN_BOARDS} a {MAX_BOARDS}, dostal jsem {n}.")
    return n


def clean_short(raw: str) -> str:
    s = fd.clean(raw or "")
    if s.casefold() in NO_RESPONSE:
        return ""
    s = re.sub(r"[^\w .'\"„“()/-]", "", s, flags=re.UNICODE)
    return s[:24].strip()


def parse_issue_body(body: str) -> dict:
    """Přečte hodnoty z hlášení založeného podle šablony (nadpisy '### ...')."""
    if not body or not re.search(r"^###\s*Odkaz na turnaj\s*$", body, re.I | re.M):
        raise LookupError("Hlášení není žádost o přidání soutěže.")
    fields: dict[str, str] = {}
    current = None
    buf: list[str] = []
    for line in body.replace("\r\n", "\n").split("\n"):
        h = re.match(r"^###\s*(.+?)\s*$", line)
        if h:
            if current:
                fields[current] = "\n".join(buf).strip()
            current = h.group(1).casefold()
            buf = []
        elif current:
            buf.append(line)
    if current:
        fields[current] = "\n".join(buf).strip()

    def get(*names: str) -> str:
        for n in names:
            for k, v in fields.items():
                if k.startswith(n.casefold()):
                    return v
        return ""

    return {
        "url": get("odkaz na turnaj"),
        "boards": get("počet šachovnic"),
        "short": get("zkratka"),
    }


def split_season(title: str) -> tuple[str, str | None]:
    """'Krajský přebor III. třídy ÚKŠS 2026/27' -> ('Krajský přebor III. třídy ÚKŠS', '2026/2027')."""
    t = fd.clean(title)
    m = SEASON_RE.search(t)
    if not m:
        return t, None
    start, end = m.group(1), m.group(2)
    if len(end) == 2:
        end = start[:2] + end
    return fd.clean(t[: m.start()]).rstrip(",-–"), f"{start}/{end}"


def tournament_title(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["h1", "h2", "h3"]):
        text = fd.clean(tag.get_text(" "))
        # druhý nadpis bývá název zobrazeného seznamu, ne turnaje
        if text and not re.match(r"^(los|sestava|křížová|startovní|abecední|herní|tabulka)", text, re.I):
            return text
    title = soup.find("title")
    text = fd.clean(title.get_text(" ")) if title else ""
    return re.sub(r"^.*?chess-results\.com\s*-\s*", "", text, flags=re.I)


def shorten(name: str) -> str:
    """Zkrátí název na popisek do nabídky, když uživatel zkratku nevyplnil."""
    n = re.sub(r"\b(ÚKŠS|UKŠS|ŠSČR|SSCR)\b", "", name).strip(" ,-–")
    return (n[:21] + "…") if len(n) > 22 else n or "Soutěž"


def probe(tnr: int) -> dict:
    """Stáhne stránku turnaje a ověří, že jde o soutěž družstev."""
    session = requests.Session()
    session.headers.update({"User-Agent": fd.UA, "Accept-Language": "cs,en;q=0.7"})
    try:
        html = fd.fetch(session, tnr, 8, retries=2)
    except RuntimeError as e:
        raise Refused(f"Stránku turnaje se nepodařilo načíst: {e}") from e
    teams = [t for t in fd.parse_rosters(html) if t["players"]]
    if len(teams) < 2:
        raise Refused(
            "Na stránce turnaje nejsou soupisky družstev. "
            "Vypadá to na turnaj jednotlivců, ten aplikace nepodporuje."
        )
    name, season = split_season(tournament_title(html))
    return {
        "name": name or f"Turnaj {tnr}",
        "season": season,
        "teams": len(teams),
        "players": sum(len(t["players"]) for t in teams),
    }


def add_entry(cfg: dict, tnr: int, boards: int, short: str, info: dict) -> dict:
    if any(c["tnr"] == tnr for c in cfg["competitions"]):
        existing = next(c for c in cfg["competitions"] if c["tnr"] == tnr)
        raise Refused(f"Tahle soutěž už v aplikaci je, vedená jako **{existing['short']}**.")
    if len(cfg["competitions"]) >= MAX_COMPETITIONS:
        raise Refused(f"Seznam soutěží je plný ({MAX_COMPETITIONS}). Napiš to prosím do hlášení bez šablony.")
    entry = {
        "id": f"t{tnr}",
        "short": short or shorten(info["name"]),
        "name": info["name"],
        "group": "",
        "tnr": tnr,
        "boards": boards,
    }
    if info["season"]:
        entry["season"] = info["season"]
    cfg["competitions"].append(entry)
    return entry


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--boards")
    ap.add_argument("--short", default="")
    ap.add_argument("--from-issue", action="store_true", help="čte hodnoty z proměnné ISSUE_BODY")
    ap.add_argument("--dry-run", action="store_true", help="nic nezapisuje, jen ověří")
    ap.add_argument("--id-file", metavar="SOUBOR", help="zapíše sem id přidané soutěže (pro navazující úlohu)")
    args = ap.parse_args()

    if args.from_issue:
        try:
            got = parse_issue_body(os.environ.get("ISSUE_BODY", ""))
        except LookupError:
            return 2
        raw_url, raw_boards, raw_short = got["url"], got["boards"], got["short"]
    else:
        raw_url, raw_boards, raw_short = args.url, args.boards, args.short
        if not raw_url or not raw_boards:
            ap.error("--url a --boards jsou povinné")

    try:
        tnr = parse_tournament_url(raw_url)
        boards = parse_boards(raw_boards)
        short = clean_short(raw_short)
        cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
        if any(c["tnr"] == tnr for c in cfg["competitions"]):
            raise Refused(
                f"Tahle soutěž už v aplikaci je, vedená jako "
                f"**{next(c['short'] for c in cfg['competitions'] if c['tnr'] == tnr)}**."
            )
        info = probe(tnr)
        entry = add_entry(cfg, tnr, boards, short, info)
    except Refused as e:
        print(f"Soutěž jsem nepřidal.\n\n{e}")
        return 1

    if not args.dry_run:
        CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if args.id_file:
            pathlib.Path(args.id_file).write_text(entry["id"], encoding="utf-8")

    print(
        f"Hotovo, soutěž je přidaná.\n\n"
        f"- **Název:** {entry['name']}\n"
        f"- **Zkratka v aplikaci:** {entry['short']}\n"
        f"- **Sezóna:** {entry.get('season', 'podle nastavení')}\n"
        f"- **Šachovnic:** {entry['boards']}\n"
        f"- **Načteno:** {info['teams']} družstev, {info['players']} hráčů\n\n"
        f"Soupisky se teď stáhnou a soutěž se objeví v nabídce v aplikaci. "
        f"Dál se obnovují automaticky každý pátek."
    )
    print(f"::notice::pridano {entry['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

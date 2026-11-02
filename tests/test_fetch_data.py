import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import fetch_data as fd  # noqa: E402

FIX = pathlib.Path(__file__).resolve().parent / "fixtures"


class RosterTests(unittest.TestCase):
    def setUp(self):
        self.teams = fd.parse_rosters((FIX / "rosters.html").read_text(encoding="utf-8"))

    def test_teams_and_captains(self):
        self.assertEqual([t["name"] for t in self.teams], ['Duras Ústí nad Labem "B"', 'SK Děčín "B"'])
        self.assertEqual(self.teams[0]["captain"], "Pavel Chrz")
        self.assertEqual(self.teams[1]["captain"], "Mašek Daniel")

    def test_players(self):
        p = self.teams[0]["players"]
        self.assertEqual(len(p), 4)
        self.assertEqual(p[0], {"no": 1, "name": "Kriz, Denis", "types": [], "nat": 2003, "fide": None})
        self.assertEqual(p[1]["types"], ["K"])
        self.assertEqual(p[2]["types"], ["H"])
        self.assertIsNone(p[2]["nat"])  # rating 0 = bez ratingu
        self.assertEqual(p[3]["types"], ["ZK"])

    def test_foreigner(self):
        bach = self.teams[1]["players"][1]
        self.assertEqual(bach["types"], ["C"])
        self.assertEqual(self.teams[1]["players"][0]["types"], ["V"])


NAMES = [
    'SPORTIS Svádov-Olšinky "B"',
    'TJ Libouchec "B"',
    'ŠK Teplice "C"',
    "Teplice Chess Club \"C\"",
    'SK Děčín "D"',
    "KŠ Štětí",
]


class RoundTests(unittest.TestCase):
    def setUp(self):
        self.rounds = fd.parse_rounds((FIX / "rounds.html").read_text(encoding="utf-8"), NAMES)

    def test_rounds_split(self):
        """Kola se musí rozdělit, ne slít do jednoho."""
        self.assertEqual([r["no"] for r in self.rounds], [1, 2, 3])
        self.assertEqual([len(r["matches"]) for r in self.rounds], [2, 2, 1])

    def test_dates(self):
        self.assertEqual(self.rounds[0]["date"], "2026-10-18")
        self.assertEqual(self.rounds[1]["date"], "2026-11-08")
        self.assertEqual(self.rounds[2]["date"], "2026-11-22")

    def test_pairs_order(self):
        self.assertEqual(
            self.rounds[0]["matches"][0],
            {"home": 'SPORTIS Svádov-Olšinky "B"', "away": 'TJ Libouchec "B"'},
        )
        self.assertEqual(self.rounds[1]["matches"][0]["home"], 'TJ Libouchec "B"')

    def test_nav_link_is_not_a_round(self):
        """Odkaz 'Kolo.1' v navigaci nesmí vytvořit kolo."""
        self.assertTrue(all(r["matches"] for r in self.rounds))
        self.assertEqual(len(self.rounds), 3)


class HelperTests(unittest.TestCase):
    def test_types(self):
        self.assertEqual(fd.parse_types("Z,ZK"), ["ZK"])
        self.assertEqual(fd.parse_types("Z"), [])
        self.assertEqual(fd.parse_types(""), [])

    def test_dates(self):
        self.assertEqual(fd.parse_date("Kolo 3 dne 2026/11/01 v 9:00"), "2026-11-01")
        self.assertEqual(fd.parse_date("1.11.2026"), "2026-11-01")
        self.assertIsNone(fd.parse_date("bez data"))


if __name__ == "__main__":
    unittest.main()

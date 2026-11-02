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


class RoundTests(unittest.TestCase):
    def test_rounds(self):
        names = ['ŠO TJ Tatran Podbořany "A"', "Šachy Povrly", 'ŠK Louny "A"', 'ŠK Slavoj Litoměřice "D"']
        rounds = fd.parse_rounds((FIX / "rounds.html").read_text(encoding="utf-8"), names)
        self.assertEqual([r["no"] for r in rounds], [1, 2])
        self.assertEqual(rounds[0]["date"], "2026-10-11")
        self.assertEqual(rounds[1]["date"], "2026-10-18")
        self.assertEqual(rounds[0]["matches"][0], {"home": 'ŠO TJ Tatran Podbořany "A"', "away": "Šachy Povrly"})
        self.assertEqual(len(rounds[0]["matches"]), 2)
        self.assertEqual(rounds[1]["matches"][0]["home"], "Šachy Povrly")


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

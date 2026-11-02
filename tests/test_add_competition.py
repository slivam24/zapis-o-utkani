import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import add_competition as ac  # noqa: E402

BODY = """### Odkaz na turnaj

https://chess-results.com/tnr1507857.aspx?lan=5

### Počet šachovnic

8

### Zkratka soutěže (nepovinné)

KP II A

### Potvrzení

- [X] Jde o soutěž družstev (ne o turnaj jednotlivců) a odkaz vede na chess-results.com.
"""


class UrlTests(unittest.TestCase):
    def test_accepts_known_forms(self):
        for url, tnr in [
            ("https://chess-results.com/tnr1507857.aspx?lan=5", 1507857),
            ("https://s1.chess-results.com/tnr1508693.aspx?lan=5&art=8&SNode=S0", 1508693),
            ("http://www.chess-results.com/tnr99.aspx", 99),
            ("  https://s3.chess-results.com/tnr1508277.aspx  ", 1508277),
            ("<https://chess-results.com/tnr1511935.aspx>", 1511935),
        ]:
            with self.subTest(url=url):
                self.assertEqual(ac.parse_tournament_url(url), tnr)

    def test_rejects_other_sites(self):
        for url in [
            "https://www.chess.cz/soutez/3459/",
            "https://evil.example.com/tnr1.aspx",
            "https://chess-results.com.evil.example/tnr1.aspx",
            "javascript:alert(1)",
            "chess-results.com/tnr1.aspx",
            "",
            "https://chess-results.com/Default.aspx?lan=5",
        ]:
            with self.subTest(url=url):
                with self.assertRaises(ac.Refused):
                    ac.parse_tournament_url(url)


class BoardsTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(ac.parse_boards("8"), 8)
        self.assertEqual(ac.parse_boards(" 5 "), 5)

    def test_out_of_range(self):
        for v in ["0", "1", "17", "99"]:
            with self.subTest(v=v):
                with self.assertRaises(ac.Refused):
                    ac.parse_boards(v)

    def test_nonsense(self):
        with self.assertRaises(ac.Refused):
            ac.parse_boards("hodně")


class ShortTests(unittest.TestCase):
    def test_strips_markup_and_limits(self):
        self.assertEqual(ac.clean_short("KP II A"), "KP II A")
        self.assertEqual(ac.clean_short("_No response_"), "")
        self.assertEqual(ac.clean_short(""), "")
        self.assertEqual(ac.clean_short("<script>x</script>"), "scriptx/script")
        self.assertLessEqual(len(ac.clean_short("A" * 100)), 24)


class IssueBodyTests(unittest.TestCase):
    def test_reads_fields(self):
        got = ac.parse_issue_body(BODY)
        self.assertEqual(got["url"], "https://chess-results.com/tnr1507857.aspx?lan=5")
        self.assertEqual(got["boards"], "8")
        self.assertEqual(got["short"], "KP II A")

    def test_other_issue_is_ignored(self):
        with self.assertRaises(LookupError):
            ac.parse_issue_body("Ahoj, aplikace mi nejde na iPhonu.")
        with self.assertRaises(LookupError):
            ac.parse_issue_body("")


class SeasonTests(unittest.TestCase):
    def test_split(self):
        self.assertEqual(
            ac.split_season("Krajský přebor III. třídy 'B' ÚKŠS 2026/27"),
            ("Krajský přebor III. třídy 'B' ÚKŠS", "2026/2027"),
        )
        self.assertEqual(ac.split_season("Extraliga 2026/2027"), ("Extraliga", "2026/2027"))
        self.assertEqual(ac.split_season("Turnaj bez sezóny"), ("Turnaj bez sezóny", None))

    def test_two_digit_season(self):
        self.assertEqual(ac.split_season("Krajský přebor KŠSV 25/26"), ("Krajský přebor KŠSV", "2025/2026"))

    def test_title_from_page(self):
        html = """<html><head><title>Chess-Results Server Chess-results.com - Krajský přebor ÚKŠS 2026/2027</title></head>
        <body><h2>Krajský přebor ÚKŠS 2026/2027</h2><h3>Los družstev pro všechna kola</h3></body></html>"""
        self.assertEqual(ac.tournament_title(html), "Krajský přebor ÚKŠS 2026/2027")

    def test_server_notice_is_not_a_title(self):
        """U starších turnajů je nad názvem upozornění serveru, to se nesmí vzít jako název."""
        notice = (
            "Poznámka: Kvůli redukci zatížení serveru denním skenováním všech odkazů "
            "(denně 100 000 přístupu a více) a vyhledávačů typu Google, Yahoo a Co, všechny odkazy "
            "turnajů starší než dva týdny (od data ukončení turnaje) jsou zobrazeny po kliknutí na tlačítko:"
        )
        html = f"""<html><head><title>Chess-Results Server Chess-results.com - Krajský přebor KŠSV 25/26</title></head>
        <body><h2>{notice}</h2><h2>Krajský přebor KŠSV 25/26</h2></body></html>"""
        self.assertEqual(ac.tournament_title(html), "Krajský přebor KŠSV 25/26")

    def test_notice_only_falls_back_to_heading(self):
        html = """<html><head><title>Chess-Results Server Chess-results.com</title></head>
        <body><h2>Poznámka: Kvůli redukci zatížení serveru</h2><h2>1. liga západ 2026/2027</h2></body></html>"""
        self.assertEqual(ac.tournament_title(html), "1. liga západ 2026/2027")

    def test_no_title_at_all(self):
        self.assertEqual(ac.tournament_title("<html><body><p>nic</p></body></html>"), "")

    def test_shorten(self):
        self.assertEqual(ac.shorten("Krajský přebor ÚKŠS"), "Krajský přebor")
        self.assertTrue(len(ac.shorten("Velmi dlouhý název soutěže družstev")) <= 22)


class AddEntryTests(unittest.TestCase):
    def cfg(self):
        return {
            "season": "2026/2027",
            "competitions": [{"id": "kp", "short": "KP", "name": "Krajský přebor", "tnr": 1507857, "boards": 8}],
        }

    def test_adds(self):
        cfg = self.cfg()
        info = {"name": "Extraliga", "season": "2026/2027", "teams": 12, "players": 200}
        entry = ac.add_entry(cfg, 123456, 8, "EXT", info)
        self.assertEqual(entry["id"], "t123456")
        self.assertEqual(entry["short"], "EXT")
        self.assertEqual(entry["season"], "2026/2027")
        self.assertEqual(len(cfg["competitions"]), 2)

    def test_short_falls_back_to_name(self):
        cfg = self.cfg()
        info = {"name": "1. liga západ ŠSČR", "season": None, "teams": 12, "players": 200}
        entry = ac.add_entry(cfg, 222, 8, "", info)
        self.assertEqual(entry["short"], "1. liga západ")
        self.assertNotIn("season", entry)

    def test_duplicate_refused(self):
        cfg = self.cfg()
        info = {"name": "Krajský přebor", "season": None, "teams": 12, "players": 200}
        with self.assertRaises(ac.Refused) as e:
            ac.add_entry(cfg, 1507857, 8, "", info)
        self.assertIn("KP", str(e.exception))

    def test_cap(self):
        cfg = self.cfg()
        cfg["competitions"] = [{"id": f"t{i}", "short": str(i), "name": "x", "tnr": i, "boards": 8} for i in range(ac.MAX_COMPETITIONS)]
        info = {"name": "Nová", "season": None, "teams": 2, "players": 10}
        with self.assertRaises(ac.Refused):
            ac.add_entry(cfg, 999999, 8, "", info)


class ConfigFileTests(unittest.TestCase):
    def test_real_config_is_valid(self):
        cfg = json.loads((pathlib.Path(ac.ROOT) / "scripts" / "competitions.json").read_text(encoding="utf-8"))
        ids = [c["id"] for c in cfg["competitions"]]
        tnrs = [c["tnr"] for c in cfg["competitions"]]
        self.assertEqual(len(ids), len(set(ids)), "id soutěží se opakují")
        self.assertEqual(len(tnrs), len(set(tnrs)), "čísla turnajů se opakují")
        for c in cfg["competitions"]:
            self.assertTrue(ac.MIN_BOARDS <= c["boards"] <= ac.MAX_BOARDS)


if __name__ == "__main__":
    unittest.main()

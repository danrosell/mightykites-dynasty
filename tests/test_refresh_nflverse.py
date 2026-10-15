import importlib.util
import unittest

spec = importlib.util.spec_from_file_location("refresh_nflverse", "scripts/refresh-nflverse.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

HEADER = "player_id,season,week,season_type,passing_yards,passing_tds,interceptions,carries,rushing_yards,rushing_tds,receptions,receiving_yards,receiving_tds\n"

class RefreshTests(unittest.TestCase):
    def test_verified_gsis_id_only(self):
        rows = module.validate_rows(HEADER + "00-1234,2026,5,REG,100,1,0,2,10,0,5,50,1\n", 2026, {"00-1234"})
        self.assertEqual(rows["00-1234"][0]["receiving_yards"], 50)
        self.assertEqual(module.validate_rows(HEADER + "00-1234,2026,5,REG,100,1,0,2,10,0,5,50,1\n", 2026, {"other"}), {})
    def test_schema_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            module.validate_rows("player_id,week\na,5\n", 2026, {"a"})
    def test_duplicate_player_week_rejected(self):
        line = "00-1234,2026,5,REG,100,1,0,2,10,0,5,50,1\n"
        with self.assertRaises(ValueError):
            module.validate_rows(HEADER + line + line, 2026, {"00-1234"})
    def test_unknown_asset_rejected(self):
        with self.assertRaises(ValueError):
            module.select_asset({"assets": [{"name": "other.csv"}]})

if __name__ == "__main__":
    unittest.main()

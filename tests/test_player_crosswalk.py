import importlib.util
import sys
import unittest
sys.path.insert(0,"scripts")
from player_crosswalk import build_crosswalk, join_direct_gsis, combine_verified

class CrosswalkTests(unittest.TestCase):
    def setUp(self):
        self.players={"s1":{"position":"WR","gsis_id":"00-1"},"s2":{"position":"RB"},"s3":{"position":"TE","gsis_id":"00-3"}}
        self.ids={"00-1","00-2","00-3"}
    def test_direct_ids(self):
        self.assertEqual(join_direct_gsis(self.players,self.ids),{"s1":"00-1","s3":"00-3"})
    def test_verified_external_missing_sleeper_gsis(self):
        csv="sleeper_id,gsis_id\ns2,00-2\n"
        self.assertEqual(build_crosswalk(csv,self.players,self.ids),{"s2":"00-2"})
    def test_conflicting_sleeper_gsis_rejected(self):
        csv="sleeper_id,gsis_id\ns1,00-2\n"
        with self.assertRaises(ValueError):build_crosswalk(csv,self.players,self.ids)
    def test_unknown_identity_not_accepted(self):
        csv="sleeper_id,gsis_id\nmissing,00-2\n"
        self.assertEqual(build_crosswalk(csv,self.players,self.ids),{})
    def test_null_sentinels_excluded(self):
        csv="sleeper_id,gsis_id\ns2,NA\nNA,00-2\n"
        self.assertEqual(build_crosswalk(csv,self.players,self.ids),{})
    def test_duplicate_external_identity_rejected(self):
        csv="sleeper_id,gsis_id\\ns2,00-2\\ns2,00-3\\n"
        with self.assertRaises(ValueError):build_crosswalk(csv,self.players,self.ids)
    def test_combined_identity_map(self):
        self.assertEqual(combine_verified({"s1":"00-1"},{"s2":"00-2"}),{"s1":"00-1","s2":"00-2"})
    def test_duplicate_gsis_rejected(self):
        with self.assertRaises(ValueError):combine_verified({"s1":"00-1"},{"s2":"00-1"})

if __name__=="__main__":unittest.main()

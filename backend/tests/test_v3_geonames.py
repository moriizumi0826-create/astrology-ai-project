import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from backend.v3.location_search import JAPANESE_PREFECTURES, search_locations
from scripts.build_v3_geonames import build


def row(place_id, name, aliases, latitude, longitude, feature_class, feature_code,
        country, admin1, population, zone):
    return "\t".join(map(str, (
        place_id, name, name, aliases, latitude, longitude, feature_class, feature_code,
        country, "", admin1, "", "", "", population, "", "", zone, "2026-09-27",
    )))


class GeoNamesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.database = self.root / "places.sqlite"
        city_rows = [
            row(1859730, "Kawaguchi", "川口,川口市", 35.81, 139.72,
                "P", "PPLA2", "JP", "34", 607373, "Asia/Tokyo"),
            row(5128581, "New York City", "New York", 40.71, -74.01,
                "P", "PPL", "US", "NY", 8500000, "America/New_York"),
            row(2988507, "Paris", "Paris", 48.85, 2.35,
                "P", "PPLC", "FR", "11", 2160000, "Europe/Paris"),
            row(1850147, "Tokyo", "东京,東京,東京都", 35.68, 139.69,
                "P", "PPLC", "JP", "40", 9733276, "Asia/Tokyo"),
        ]
        japan_rows = [
            city_rows[0],
            row(1859171, "Kobe", "神戸,神戸市", 34.69, 135.19,
                "P", "PPLA", "JP", "13", 1500000, "Asia/Tokyo"),
            row(1859726, "Kawaguchi-shi", "川口市", 35.82, 139.73,
                "A", "ADM2", "JP", "34", 583989, "Asia/Tokyo"),
            row(9999999, "Test Airport", "テスト空港", 35.83, 139.74,
                "S", "AIRP", "JP", "34", 0, "Asia/Tokyo"),
        ]
        for filename, member, rows in (
            ("cities500.zip", "cities500.txt", city_rows),
            ("JP.zip", "JP.txt", japan_rows),
        ):
            with ZipFile(self.source / filename, "w") as archive:
                archive.writestr(member, "\n".join(rows) + "\n")
        (self.source / "admin1CodesASCII.txt").write_text(
            "JP.34\tSaitama\tSaitama\t1\nJP.13\tHyōgo\tHyogo\t4\n"
            "JP.40\tTokyo\tTokyo\t5\n"
            "US.NY\tNew York\tNew York\t2\n"
            "FR.11\tÎle-de-France\tIle-de-France\t3\n", encoding="utf-8")
        (self.source / "countryInfo.txt").write_text(
            "JP\tJPN\t392\tJA\tJapan\nUS\tUSA\t840\tUS\tUnited States\n"
            "FR\tFRA\t250\tFR\tFrance\n", encoding="utf-8")

    def test_build_and_search_without_external_service(self):
        manifest = build(self.source, self.database)
        self.assertEqual(manifest["places"], 6)
        self.assertEqual(len(JAPANESE_PREFECTURES), 47)
        japan = search_locations("川口市", "JP", "Saitama", database=self.database)
        self.assertEqual(len(japan), 1)
        self.assertEqual(japan[0]["display_name"], "川口市, 埼玉県, 日本")
        self.assertEqual(japan[0]["timezone_name"], "Asia/Tokyo")
        self.assertEqual(search_locations("川口町", "JP", "Saitama", database=self.database)[0]["query"], "川口町")
        self.assertEqual(search_locations("神戸市", "JP", "Hyogo", database=self.database)[0]["display_name"],
                         "神戸市, 兵庫県, 日本")
        self.assertEqual(search_locations("Kobe", "JP", "Hyogo", database=self.database)[0]["display_name"],
                         "Kobe, 兵庫県, 日本")
        self.assertEqual(search_locations("Tokyo", "JP", database=self.database)[0]["display_name"],
                         "Tokyo, 東京都, 日本")
        self.assertEqual(search_locations("東京", "JP", database=self.database)[0]["display_name"],
                         "東京, 東京都, 日本")
        world = search_locations("New York, United States", "WORLD", database=self.database)
        self.assertEqual(world[0]["display_name"], "New York City, New York, United States")
        self.assertEqual(search_locations("Paris", "FR", database=self.database)[0]["timezone_name"], "Europe/Paris")
        self.assertEqual(search_locations("Test Airport", "JP", "Saitama", database=self.database), [])


if __name__ == "__main__":
    unittest.main()

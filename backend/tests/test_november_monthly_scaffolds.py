from __future__ import annotations

import csv
import unittest
from collections import Counter
from datetime import datetime
from pathlib import Path

from scripts import generate_monthly_overview_aspect_cluster_scaffold as clusters
from scripts import generate_monthly_overview_event_template_scaffold as events
from scripts import generate_monthly_long_term_background as backgrounds


ROOT = Path(__file__).resolve().parents[2]


class NovemberMonthlyScaffoldTests(unittest.TestCase):
    def test_stationing_planets_cover_both_house_directions(self):
        rows = events.build_rows(2026, 11)
        self.assertEqual(len(rows), 396)
        self.assertEqual(len({r['Template_ID'] for r in rows}), 396)
        natal_rows = [r for r in rows if r['Event_Type'] == 'natal_house_ingress']
        for planet, sign in [('MERCURY', 'SCORPIO'), ('VENUS', 'LIBRA')]:
            actual = {
                (r['Natal_House_From'], r['Natal_House_To'])
                for r in natal_rows
                if r['Planet'] == planet and r['Transit_Sign_To'] == sign
            }
            expected = {
                (start, (start - 1 + direction) % 12 + 1)
                for start in range(1, 13) for direction in (-1, 1)
            }
            self.assertEqual(actual, expected)
        self.assertEqual(Counter(r['Event_Type'] for r in rows),
                         {'sign_ingress': 288, 'natal_house_ingress': 108})

    def test_existing_event_months_keep_their_protected_structure(self):
        for month in (8, 9, 10):
            with self.subTest(month=month):
                path = ROOT / 'database' / f'M_Monthly_Overview_Event_Paragraphs_2026_{month:02d}.csv'
                with path.open(encoding='utf-8-sig', newline='') as handle:
                    actual = list(csv.DictReader(handle))
                generated = events.build_rows(2026, month)
                columns = [c for c in events.FIELDNAMES if c not in ('Paragraph_Template', 'Active_Flag')]
                self.assertEqual(
                    [{c: r[c] for c in columns} for r in actual],
                    [{c: str(r[c]) for c in columns} for r in generated],
                )

    def test_november_backgrounds_follow_actual_segments(self):
        rows = backgrounds.build_rows(2026, 11)
        self.assertEqual(len(rows), 276)
        self.assertEqual(Counter(r['Record_Type'] for r in rows),
                         {'background': 60, 'resonance': 216})
        self.assertFalse(any(r['Match_Type'] == 'same_sign' for r in rows))
        self.assertTrue(all('2026-11-01' <= r['Valid_From'] <= r['Valid_To'] <= '2026-11-30' for r in rows))

    def test_cluster_peaks_agree_with_swiss_ephemeris(self):
        try:
            import swisseph as swe
        except ImportError:
            self.skipTest('pyswisseph is required for astronomical verification')
        for definition in clusters.CLUSTER_DEFINITIONS['2026-11']:
            first_key = definition['Date_Key'].split('|')[0]
            peak = datetime.fromisoformat(definition['Peak_At'])
            utc = peak.timestamp() / 86400 + 2440587.5
            if first_key.startswith('FULL_MOON:'):
                first, second, angle = 'SUN', 'MOON', 180
            else:
                first, second, angle, _ = first_key.split(':')
                angle = int(angle)
            left = swe.calc_ut(utc, getattr(swe, first), swe.FLG_SPEED)[0][0]
            right = swe.calc_ut(utc, getattr(swe, second), swe.FLG_SPEED)[0][0]
            separation = abs((left - right + 180) % 360 - 180)
            with self.subTest(cluster=definition['Cluster_ID']):
                self.assertLess(abs(separation - angle), 0.001)
                self.assertEqual(first_key[-10:], definition['Peak_At'][:10])
        rows = clusters.build_rows(2026, 11)
        self.assertEqual(len(rows), 432)
        self.assertEqual(len({r['Template_ID'] for r in rows}), 432)


if __name__ == '__main__':
    unittest.main()

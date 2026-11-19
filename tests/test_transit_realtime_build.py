import unittest

from scripts.build_transit_data import strict_realtime_eligible


class RealtimeCompatibilityTests(unittest.TestCase):
    def test_exact_trip_and_ordered_stop_sequence_is_eligible(self):
        all_sequences = {
            "trip-a": ("stop-1", "stop-2", "stop-3"),
            "trip-b": ("stop-9", "stop-8"),
        }
        realtime_sequences = {
            "trip-a": ("stop-1", "stop-2", "stop-3"),
            "trip-b": ("stop-9", "stop-8"),
        }
        self.assertEqual(
            strict_realtime_eligible(all_sequences, realtime_sequences),
            ["trip-a", "trip-b"],
        )

    def test_same_trip_id_with_different_stop_order_is_rejected(self):
        all_sequences = {"trip-a": ("stop-1", "stop-2", "stop-3")}
        realtime_sequences = {"trip-a": ("stop-1", "stop-3", "stop-2")}
        self.assertEqual(strict_realtime_eligible(all_sequences, realtime_sequences), [])

    def test_missing_or_extra_realtime_stops_are_rejected(self):
        all_sequences = {
            "trip-a": ("stop-1", "stop-2", "stop-3"),
            "trip-b": ("stop-1", "stop-2"),
        }
        realtime_sequences = {
            "trip-a": ("stop-1", "stop-2"),
            "trip-b": ("stop-1", "stop-2", "stop-3"),
        }
        self.assertEqual(strict_realtime_eligible(all_sequences, realtime_sequences), [])

    def test_route_or_headsign_similarity_cannot_create_eligibility(self):
        all_sequences = {"scheduled-trip": ("A", "B", "C")}
        realtime_sequences = {"different-trip": ("A", "B", "C")}
        self.assertEqual(strict_realtime_eligible(all_sequences, realtime_sequences), [])


if __name__ == "__main__":
    unittest.main()

import unittest

from scripts.build_transit_data import encode_polyline, shape_shard, fnv1a_32


class MultimodalBuildTests(unittest.TestCase):
    def test_polyline_encoder_matches_canonical_precision5_example(self):
        points = [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
        expected = "_p~iF~ps|U_ulLnnqC_mqNvxq" + chr(96) + "@"
        self.assertEqual(encode_polyline(points), expected)

    def test_shape_shard_is_stable(self):
        self.assertEqual(shape_shard("shape-123", 64), "3f")
        self.assertEqual(shape_shard("5858_1", 64), "35")
        self.assertEqual(fnv1a_32("abc"), 0x1A47E90B)

    def test_shape_shards_require_power_of_two(self):
        with self.assertRaises(ValueError):
            shape_shard("shape", 63)


if __name__ == "__main__":
    unittest.main()

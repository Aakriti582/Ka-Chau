"""
Tests for what precision removes from the response.

Precision is the whole privacy model. A friend chooses how much of their
position I am allowed to see, and the server is the only thing enforcing that
choice — by the time a payload reaches the client the decision has already
been made.

This has been flattened twice in this project, both times invisibly: the
interface renders a distance identically whether or not it was ever supposed
to exist. So the tests here are absence assertions. Checking that approx
returns a distance proves almost nothing; checking that it returns no
coordinates is the test that would have caught both regressions.

Every test isolates one precision level, or one boundary of one bucket.
"""

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from rest_framework import status
from rest_framework.test import APITestCase

from proximity.models import Friendship, LastKnownLocation, LocationShare

User = get_user_model()

# Thamel, Kathmandu. The reference point every other location is measured from.
THAMEL = Point(85.3115, 27.7154, srid=4326)

# ~500 m from Thamel. Comfortably inside the 2 km radius.
NEARBY_POINT = Point(85.3160, 27.7180, srid=4326)

# Points due north of Thamel at roughly these distances; one degree of latitude
# is ~110.8 km here. They sit in the middle of each bucket rather than on its
# edge on purpose — a fixture placed at exactly 500 m would be asserting which
# spheroid PostGIS uses, not which bucket the view chooses.
POINT_300M = Point(85.3115, 27.7154 + 0.00271, srid=4326)
POINT_750M = Point(85.3115, 27.7154 + 0.00677, srid=4326)
POINT_1500M = Point(85.3115, 27.7154 + 0.01354, srid=4326)


class PrecisionTestCase(APITestCase):
    """Shared setup: one friend, located ~500 m away, with an accepted
    friendship already in place. Tests choose the precision and, where the
    bucket is the subject, move the friend."""

    def setUp(self):
        self.me = User.objects.create_user(username="me", password="TestPass!2026")
        self.friend = User.objects.create_user(
            username="friend", password="TestPass!2026"
        )

        Friendship.objects.create(
            from_user=self.me,
            to_user=self.friend,
            status=Friendship.Status.ACCEPTED,
        )

        LastKnownLocation.objects.create(user=self.me, point=THAMEL)
        LastKnownLocation.objects.create(user=self.friend, point=NEARBY_POINT)

        self.client.force_authenticate(user=self.me)
        self.url = "/api/nearby/"

    def share_at(self, precision):
        """The friend shares with me at one precision. That single choice is
        what every test in this file is about."""
        return LocationShare.objects.create(
            owner=self.friend, viewer=self.me, precision=precision
        )

    def place_friend(self, point):
        """.update() rather than .save(): updated_at is auto_now, so saving
        would be fine here but the query form keeps the freshness of the row
        out of the picture entirely."""
        LastKnownLocation.objects.filter(user=self.friend).update(point=point)

    def entry_for_friend(self):
        """The friend's entry in the nearby list, fetched fresh."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["nearby"][0]


class ExactPrecisionTests(PrecisionTestCase):
    def test_exact_returns_coordinates(self):
        """The only precision that may place a friend on a map."""
        self.share_at(LocationShare.Precision.EXACT)

        entry = self.entry_for_friend()

        self.assertIn("latitude", entry)
        self.assertIn("longitude", entry)

    def test_exact_returns_a_distance(self):
        self.share_at(LocationShare.Precision.EXACT)

        entry = self.entry_for_friend()

        self.assertIn("distance_m", entry)
        self.assertIsNotNone(entry["distance_m"])


class ApproxPrecisionTests(PrecisionTestCase):
    def test_approx_returns_a_distance(self):
        self.share_at(LocationShare.Precision.APPROX)

        entry = self.entry_for_friend()

        self.assertIn("distance_m", entry)

    def test_approx_does_not_return_latitude(self):
        """Approx means "how far", never "where". A latitude here is the
        exact leak this precision exists to prevent."""
        self.share_at(LocationShare.Precision.APPROX)

        entry = self.entry_for_friend()

        self.assertNotIn("latitude", entry)

    def test_approx_does_not_return_longitude(self):
        self.share_at(LocationShare.Precision.APPROX)

        entry = self.entry_for_friend()

        self.assertNotIn("longitude", entry)

    def test_approx_distance_is_rounded_to_the_nearest_100_metres(self):
        """The rounding is the privacy mechanism, not a display convenience.
        An unrounded distance from two friends triangulates a position, so it
        has to be coarsened before it leaves the server rather than after."""
        self.share_at(LocationShare.Precision.APPROX)

        entry = self.entry_for_friend()

        self.assertEqual(entry["distance_m"] % 100, 0)


class ProximityOnlyPrecisionTests(PrecisionTestCase):
    def test_proximity_only_returns_the_nearby_flag(self):
        self.share_at(LocationShare.Precision.PROXIMITY_ONLY)

        entry = self.entry_for_friend()

        self.assertTrue(entry["nearby"])

    def test_proximity_only_returns_a_bucket(self):
        self.share_at(LocationShare.Precision.PROXIMITY_ONLY)

        entry = self.entry_for_friend()

        self.assertIn("distance_bucket", entry)

    def test_proximity_only_does_not_return_latitude(self):
        self.share_at(LocationShare.Precision.PROXIMITY_ONLY)

        entry = self.entry_for_friend()

        self.assertNotIn("latitude", entry)

    def test_proximity_only_does_not_return_longitude(self):
        self.share_at(LocationShare.Precision.PROXIMITY_ONLY)

        entry = self.entry_for_friend()

        self.assertNotIn("longitude", entry)

    def test_proximity_only_does_not_return_a_distance(self):
        """The strictest of the three, and the default. A number here would
        undo the whole point of the setting — the client has no way to know
        the figure was not meant to be there."""
        self.share_at(LocationShare.Precision.PROXIMITY_ONLY)

        entry = self.entry_for_friend()

        self.assertNotIn("distance_m", entry)


class DistanceBucketTests(PrecisionTestCase):
    """One test per bucket. The buckets are the entire vocabulary available to
    a proximity_only share, so each boundary is worth pinning separately."""

    def test_under_500m_bucket(self):
        self.share_at(LocationShare.Precision.PROXIMITY_ONLY)
        self.place_friend(POINT_300M)

        entry = self.entry_for_friend()

        self.assertEqual(entry["distance_bucket"], "under_500m")

    def test_under_1km_bucket(self):
        self.share_at(LocationShare.Precision.PROXIMITY_ONLY)
        self.place_friend(POINT_750M)

        entry = self.entry_for_friend()

        self.assertEqual(entry["distance_bucket"], "under_1km")

    def test_under_2km_bucket(self):
        self.share_at(LocationShare.Precision.PROXIMITY_ONLY)
        self.place_friend(POINT_1500M)

        entry = self.entry_for_friend()

        self.assertEqual(entry["distance_bucket"], "under_2km")


class ShareDefaultPrecisionTests(PrecisionTestCase):
    def test_share_created_without_a_precision_defaults_to_proximity_only(self):
        """The safest option has to be the one you get by omission. A client
        that forgets the field must not end up granting the most revealing
        precision available."""
        response = self.client.post(
            "/api/shares/", {"username": "friend"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["precision"], LocationShare.Precision.PROXIMITY_ONLY
        )

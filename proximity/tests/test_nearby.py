"""
Tests for the /api/nearby/ endpoint.

This is where a bug is most dangerous. A leak here is invisible: a friend
appears who should not have, or a distance is returned that was never meant
to leave the server, and nothing in the interface looks wrong.

Every test here isolates one rule. The setUp gives every user a location and
a friendship, so an individual test only has to change the one thing it is
about.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from proximity.models import Friendship, LastKnownLocation, LocationShare

User = get_user_model()

# Thamel, Kathmandu. The reference point every other location is measured from.
THAMEL = Point(85.3115, 27.7154, srid=4326)

# ~500 m from Thamel. Comfortably inside the 2 km radius.
NEARBY_POINT = Point(85.3160, 27.7180, srid=4326)

# Patan, ~4.5 km from Thamel. Comfortably outside it.
FAR_POINT = Point(85.3240, 27.6766, srid=4326)


class NearbyTestCase(APITestCase):
    """Shared setup: two users, an accepted friendship, both located."""

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

    def share_with_me(self, **kwargs):
        """The friend shares their location with me. Defaults to an active
        exact share, so tests can override only the field they care about."""
        return LocationShare.objects.create(
            owner=self.friend,
            viewer=self.me,
            precision=kwargs.pop("precision", LocationShare.Precision.EXACT),
            **kwargs,
        )

    def usernames_in(self, key, response):
        return [entry["user"]["username"] for entry in response.data[key]]


class NearbyRadiusTests(NearbyTestCase):
    def test_friend_within_radius_appears(self):
        self.share_with_me()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("friend", self.usernames_in("nearby", response))
        self.assertEqual(response.data["counts"]["nearby"], 1)

    def test_friend_outside_radius_does_not_appear(self):
        self.share_with_me()
        LastKnownLocation.objects.filter(user=self.friend).update(point=FAR_POINT)

        response = self.client.get(self.url)

        self.assertEqual(response.data["nearby"], [])
        self.assertEqual(response.data["counts"]["nearby"], 0)
        # Still sharing — they are simply too far away. The distinction
        # matters, because the interface says something different for each.
        self.assertEqual(response.data["counts"]["sharing_with_me"], 1)

    def test_distance_is_returned_in_metres(self):
        self.share_with_me()

        response = self.client.get(self.url)

        distance = response.data["nearby"][0]["distance_m"]
        # ~529 m by PostGIS. A wide window: this asserts the units are metres
        # and the geography type is doing spherical maths, not that the
        # figure is exact to the metre.
        self.assertGreater(distance, 400)
        self.assertLess(distance, 700)


class NearbyConsentTests(NearbyTestCase):
    def test_friend_without_a_share_is_invisible(self):
        """No share row. They are an accepted friend standing 500 m away and
        the endpoint must not mention them at all."""
        response = self.client.get(self.url)

        self.assertEqual(response.data["nearby"], [])
        self.assertEqual(response.data["stale"], [])
        self.assertEqual(response.data["counts"]["sharing_with_me"], 0)

    def test_paused_share_hides_the_friend(self):
        self.share_with_me(is_paused=True)

        response = self.client.get(self.url)

        self.assertEqual(response.data["nearby"], [])
        # Reported separately, so the interface can say "sharing is paused"
        # rather than "nobody is nearby".
        self.assertEqual(response.data["counts"]["paused"], 1)
        self.assertEqual(response.data["counts"]["sharing_with_me"], 0)

    def test_expired_share_hides_the_friend(self):
        self.share_with_me(expires_at=timezone.now() - timedelta(hours=1))

        response = self.client.get(self.url)

        self.assertEqual(response.data["nearby"], [])
        self.assertEqual(response.data["counts"]["sharing_with_me"], 0)

    def test_share_with_a_future_expiry_still_works(self):
        self.share_with_me(expires_at=timezone.now() + timedelta(hours=1))

        response = self.client.get(self.url)

        self.assertIn("friend", self.usernames_in("nearby", response))

    def test_sharing_is_directional(self):
        """The single most important test in the project.

        The friend shares with me. I have granted nothing in return. So I can
        see them and they cannot see me — from exactly the same data.
        """
        self.share_with_me()

        mine = self.client.get(self.url)
        self.assertIn("friend", self.usernames_in("nearby", mine))

        self.client.force_authenticate(user=self.friend)
        theirs = self.client.get(self.url)

        self.assertEqual(theirs.data["nearby"], [])
        self.assertEqual(theirs.data["counts"]["sharing_with_me"], 0)


class NearbyFreshnessTests(NearbyTestCase):
    def backdate_friend(self, minutes):
        """updated_at has auto_now=True, so .save() would overwrite the value
        with the current time. .update() writes straight to SQL and bypasses
        the field's auto behaviour — it is the only way to do this."""
        LastKnownLocation.objects.filter(user=self.friend).update(
            updated_at=timezone.now() - timedelta(minutes=minutes)
        )

    def test_stale_location_moves_out_of_nearby(self):
        self.share_with_me()
        self.backdate_friend(30)

        response = self.client.get(self.url)

        self.assertEqual(response.data["nearby"], [])
        self.assertIn("friend", self.usernames_in("stale", response))
        self.assertEqual(response.data["stale"][0]["reason"], "stale")
        # A real timestamp, so the interface can say "last seen 30 min ago"
        # rather than only that something is wrong.
        self.assertIsNotNone(response.data["stale"][0]["updated_at"])

    def test_fresh_location_stays_in_nearby(self):
        self.share_with_me()
        self.backdate_friend(5)

        response = self.client.get(self.url)

        self.assertIn("friend", self.usernames_in("nearby", response))
        self.assertEqual(response.data["stale"], [])

    def test_friend_who_never_reported_a_location(self):
        self.share_with_me()
        LastKnownLocation.objects.filter(user=self.friend).delete()

        response = self.client.get(self.url)

        self.assertEqual(response.data["nearby"], [])
        entry = response.data["stale"][0]
        self.assertEqual(entry["reason"], "never_shared_location")
        # Distinct from "stale": null age means they have never shared at all,
        # which is a different message to the user.
        self.assertIsNone(entry["updated_at"])


class NearbyCallerLocationTests(NearbyTestCase):
    def test_caller_without_a_location_gets_400(self):
        """The radius is centred on the caller. With no position there is no
        centre, so the question cannot be answered at all."""
        self.share_with_me()
        LastKnownLocation.objects.filter(user=self.me).delete()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_unauthenticated_request_is_rejected(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class NearbyResponseShapeTests(NearbyTestCase):
    def test_response_always_carries_counts(self):
        """An empty result must still explain itself. Four different
        situations produce an empty nearby list, and the counts block is how
        the interface tells them apart."""
        response = self.client.get(self.url)

        self.assertIn("nearby", response.data)
        self.assertIn("stale", response.data)
        self.assertIn("counts", response.data)

        for key in ("sharing_with_me", "nearby", "stale", "paused"):
            self.assertIn(key, response.data["counts"])

    def test_every_entry_carries_a_timestamp(self):
        """A distance without an age is misleading — it looks live whether it
        is five seconds or fifty minutes old."""
        self.share_with_me()

        response = self.client.get(self.url)

        self.assertIsNotNone(response.data["nearby"][0]["updated_at"])

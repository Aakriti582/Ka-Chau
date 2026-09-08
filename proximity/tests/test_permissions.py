"""
Tests for who may do what.

Friendships and shares both have two people attached to them, and almost
every rule here is about telling those two people apart. The sender of a
request is not the recipient; the owner of a share is not its viewer. Getting
that backwards does not raise an error — it silently gives somebody a control
over their own visibility that belongs to the other person.

The lookups are also expected to be quiet. Asking about a row that is none of
your business returns 404 rather than 403, because the difference between
those two answers is itself information.

Every test isolates one rule.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from proximity.models import Friendship, LocationShare

User = get_user_model()


class PermissionsTestCase(APITestCase):
    """Shared setup: three users, so that "somebody else entirely" is always
    available. Friendship rows are left to the individual tests, because the
    state of that row is usually the thing under test."""

    def setUp(self):
        self.me = User.objects.create_user(username="me", password="TestPass!2026")
        self.friend = User.objects.create_user(
            username="friend", password="TestPass!2026"
        )
        self.stranger = User.objects.create_user(
            username="stranger", password="TestPass!2026"
        )

        self.client.force_authenticate(user=self.me)

    def pending(self, from_user, to_user):
        return Friendship.objects.create(
            from_user=from_user, to_user=to_user, status=Friendship.Status.PENDING
        )

    def accepted(self, from_user, to_user):
        return Friendship.objects.create(
            from_user=from_user, to_user=to_user, status=Friendship.Status.ACCEPTED
        )

    def share(self, owner, viewer, **kwargs):
        """Directional by construction: owner is the one being seen, viewer
        the one allowed to see. Swapping them is the mistake these tests are
        looking for."""
        return LocationShare.objects.create(owner=owner, viewer=viewer, **kwargs)


class FriendshipAcceptTests(PermissionsTestCase):
    def test_sender_cannot_accept_their_own_request(self):
        """Otherwise a request is not a request. Anyone could add themselves
        to someone else's friend list by sending and then accepting."""
        friendship = self.pending(self.me, self.friend)

        response = self.client.post(f"/api/friendships/{friendship.id}/accept/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_accepting_an_already_accepted_request_is_rejected(self):
        friendship = self.pending(self.friend, self.me)
        self.client.post(f"/api/friendships/{friendship.id}/accept/")

        response = self.client.post(f"/api/friendships/{friendship.id}/accept/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_friendship_between_two_other_people_is_not_found(self):
        """404, and deliberately not 403. A 403 would confirm that the row
        exists — telling me that those two people have some relationship,
        which is not mine to learn. The queryset filters by participant
        first, so the object is never found at all."""
        theirs = self.pending(self.friend, self.stranger)

        response = self.client.post(f"/api/friendships/{theirs.id}/accept/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class FriendshipRejectTests(PermissionsTestCase):
    def test_only_the_recipient_may_reject(self):
        """Rejecting is the recipient's answer. The sender withdrawing is a
        different action with a different endpoint."""
        friendship = self.pending(self.me, self.friend)

        response = self.client.post(f"/api/friendships/{friendship.id}/reject/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class FriendshipCancelTests(PermissionsTestCase):
    def test_only_the_sender_may_cancel(self):
        """The mirror of rejecting: withdrawing your own request is yours to
        do, and the recipient must not be able to do it for you."""
        friendship = self.pending(self.friend, self.me)

        response = self.client.post(f"/api/friendships/{friendship.id}/cancel/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class FriendshipRemovalTests(PermissionsTestCase):
    def test_removing_a_friendship_deletes_shares_in_both_directions(self):
        """Sharing is directional, so two independent rows can exist between
        the same pair. Removing the friendship has to revoke both — leaving
        either one behind keeps a channel open that no screen shows any
        more, which is the worst kind of leak: consented to once, invisible
        afterwards."""
        friendship = self.accepted(self.me, self.friend)
        self.share(owner=self.me, viewer=self.friend)
        self.share(owner=self.friend, viewer=self.me)

        response = self.client.post(f"/api/friendships/{friendship.id}/remove/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(
            LocationShare.objects.filter(
                owner__in=[self.me, self.friend],
                viewer__in=[self.me, self.friend],
            ).count(),
            0,
        )

    def test_removing_a_friendship_leaves_a_third_partys_share_untouched(self):
        """The delete is scoped to the two people in the friendship. A blunter
        query — everything I own, say — would quietly revoke every other
        friend at the same time, and nothing would report that it had."""
        friendship = self.accepted(self.me, self.friend)
        self.accepted(self.me, self.stranger)
        self.share(owner=self.me, viewer=self.friend)
        unrelated = self.share(owner=self.me, viewer=self.stranger)

        self.client.post(f"/api/friendships/{friendship.id}/remove/")

        self.assertTrue(LocationShare.objects.filter(pk=unrelated.pk).exists())


class ShareViewerPermissionTests(PermissionsTestCase):
    """A share is controlled by the person being seen, never by the person
    seeing. Every test here is the viewer reaching for a control that is not
    theirs, and being told the row does not exist."""

    def setUp(self):
        super().setUp()
        self.accepted(self.friend, self.me)
        # The friend shares with me. I am the viewer, so none of this is mine
        # to change — only to receive.
        self.granted = self.share(owner=self.friend, viewer=self.me)

    def test_viewer_cannot_pause_a_share_granted_to_them(self):
        response = self.client.post(f"/api/shares/{self.granted.id}/pause/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_viewer_cannot_patch_a_share_granted_to_them(self):
        """Being able to raise your own precision would invert the whole
        model — the viewer would be granting themselves the access."""
        response = self.client.patch(
            f"/api/shares/{self.granted.id}/",
            {"precision": LocationShare.Precision.EXACT},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_viewer_cannot_delete_a_share_granted_to_them(self):
        response = self.client.delete(f"/api/shares/{self.granted.id}/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ShareCreationTests(PermissionsTestCase):
    def test_share_with_a_non_friend_is_rejected(self):
        """Friendship is the gate. Without it, knowing a username would be
        enough to start broadcasting at somebody."""
        response = self.client.post(
            "/api/shares/", {"username": "stranger"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_share_is_rejected(self):
        """One row per pair per direction. A second row would mean two
        precisions in force at once, with no way to say which is answered."""
        self.accepted(self.me, self.friend)
        self.share(owner=self.me, viewer=self.friend)

        response = self.client.post(
            "/api/shares/", {"username": "friend"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expiry_in_the_past_is_rejected_on_create(self):
        self.accepted(self.me, self.friend)

        response = self.client.post(
            "/api/shares/",
            {
                "username": "friend",
                "expires_at": (timezone.now() - timedelta(hours=1)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expires_at", response.data)


class ShareUpdateTests(PermissionsTestCase):
    def setUp(self):
        super().setUp()
        self.accepted(self.me, self.friend)
        self.mine = self.share(owner=self.me, viewer=self.friend)

    def test_expiry_in_the_past_is_rejected_on_update(self):
        """Regression test.

        The create serializer rejected a past expiry, but PATCH went through
        a different serializer that carried no such check — so an existing
        share could be given an expiry that had already passed. Whether that
        read as "expired" or as "no expiry" depended on which code looked at
        it, and an already-lapsed permission that some readers treat as
        permanent is precisely the state this field must never reach.
        """
        response = self.client.patch(
            f"/api/shares/{self.mine.id}/",
            {"expires_at": (timezone.now() - timedelta(hours=1)).isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expires_at", response.data)

    def test_is_paused_cannot_be_set_through_patch(self):
        """Pausing has its own endpoint. Accepting it as a writable field
        here would give two routes to the same state, and the request has to
        say so by changing nothing rather than by failing — the caller has
        not done anything wrong, the field is simply not theirs to write."""
        response = self.client.patch(
            f"/api/shares/{self.mine.id}/", {"is_paused": True}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.mine.refresh_from_db()
        self.assertFalse(self.mine.is_paused)

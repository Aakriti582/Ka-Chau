"""
Tests for registration, identity and sign-out.

Registration is the only endpoint that creates a session out of nothing, and
/api/me/ is the only one that edits an identity afterwards. Both carry fields
that must not be writable: the refresh token has to stay out of reach of any
script on the page, and a username has to stay fixed once other people have
learned it and started sharing with it.

Sign-out is here for the same reason. It is the one place where doing too
little looks exactly like doing enough.

Every test isolates one rule.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.views import REFRESH_COOKIE

User = get_user_model()


class AccountsTestCase(APITestCase):
    """Shared setup: one already-registered user, for the cases that are
    about colliding with somebody who exists."""

    def setUp(self):
        self.existing = User.objects.create_user(
            username="sujata", password="TestPass!2026"
        )

        self.register_url = "/api/auth/register/"
        self.me_url = "/api/me/"
        self.logout_url = "/api/auth/logout/"

    def register(self, **fields):
        """A valid registration, with individual fields overridden, so each
        test states only the thing it is about."""
        payload = {"username": "newcomer", "password": "TestPass!2026"}
        payload.update(fields)
        return self.client.post(self.register_url, payload, format="json")


class RegistrationTests(AccountsTestCase):
    def test_registration_returns_201_with_an_access_token(self):
        """Registering signs you straight in. Without a token in the response
        the client would have to turn around and log in again with the
        credentials it just sent."""
        response = self.register()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)

    def test_registration_sets_an_httponly_refresh_cookie(self):
        """The refresh token is the long-lived credential of the two. It goes
        back as a cookie precisely so that no script on the page can read
        it — httponly is the entire point of the mechanism."""
        response = self.register()

        self.assertIn(REFRESH_COOKIE, response.cookies)
        self.assertTrue(response.cookies[REFRESH_COOKIE]["httponly"])

    def test_registration_does_not_return_the_refresh_token_in_the_body(self):
        """The cookie is worth nothing if the same value is also handed to
        JavaScript in the response it arrived with."""
        response = self.register()

        self.assertNotIn("refresh", response.data)


class UsernameRulesTests(AccountsTestCase):
    def test_username_uniqueness_is_case_insensitive(self):
        """SUJATA and sujata have to be the same person. Two accounts that
        differ only in case are indistinguishable in every place a name is
        read aloud or typed from memory, which makes sharing with the wrong
        one effortless."""
        response = self.register(username="SUJATA")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_username_with_invalid_characters_is_rejected(self):
        response = self.register(username="not a name!")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)


class PasswordRulesTests(AccountsTestCase):
    def test_weak_password_is_rejected(self):
        response = self.register(username="newcomer", password="password")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)


class MeTests(AccountsTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.existing)

    def test_display_name_can_be_updated(self):
        response = self.client.patch(
            self.me_url, {"display_name": "Sujata G"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.existing.refresh_from_db()
        self.assertEqual(self.existing.display_name, "Sujata G")

    def test_username_cannot_be_changed(self):
        """The username is how friends found you and what their shares point
        at. Letting it move would silently redirect other people's consent.

        The request succeeds and changes nothing: the caller has not done
        anything wrong, the field is simply not theirs to write.
        """
        response = self.client.patch(
            self.me_url, {"username": "someone_else"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.existing.refresh_from_db()
        self.assertEqual(self.existing.username, "sujata")


class LogoutTests(AccountsTestCase):
    def test_logout_clears_the_refresh_cookie(self):
        """Signing out has to reach the server. Dropping the access token on
        the client is not enough — while the cookie survives, the next page
        load quietly refreshes it back into a session and the user is signed
        in again without having asked to be."""
        self.client.force_authenticate(user=self.existing)

        response = self.client.post(self.logout_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.cookies[REFRESH_COOKIE].value, "")

from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models


class Friendship(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        BLOCKED = "blocked", "Blocked"

    from_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="friendships_sent",
        on_delete=models.CASCADE,
    )
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="friendships_received",
        on_delete=models.CASCADE,
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["from_user", "to_user"], name="unique_friendship"
            ),
            models.CheckConstraint(
                condition=~models.Q(from_user=models.F("to_user")),
                name="no_self_friendship",
            ),
        ]

    def __str__(self):
        return f"{self.from_user} → {self.to_user} ({self.status})"

class LocationShare(models.Model):
    class Precision(models.TextChoices):
        EXACT = "exact", "Exact location"
        APPROX = "approx", "Approximate area"
        PROXIMITY_ONLY = "proximity_only", "Proximity only"

    owner = models.ForeignKey(          # the person being seen
        settings.AUTH_USER_MODEL,
        related_name="shares_given",
        on_delete=models.CASCADE,
    )
    viewer = models.ForeignKey(         # the person allowed to see
        settings.AUTH_USER_MODEL,
        related_name="shares_received",
        on_delete=models.CASCADE,
    )
    precision = models.CharField(
        max_length=20,
        choices=Precision.choices,
        default=Precision.PROXIMITY_ONLY,
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    is_paused = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "viewer"], name="unique_share"
            ),
        ]

    @property
    def is_active(self):
        from django.utils.timezone import now
        if self.is_paused:
            return False
        return self.expires_at is None or self.expires_at > now()

class LastKnownLocation(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        related_name="location",
        on_delete=models.CASCADE,
        primary_key=True,
    )
    point = gis_models.PointField(geography=True, spatial_index=True)
    accuracy_m = models.FloatField(null=True, blank=True)
    battery_pct = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} @ {self.updated_at:%H:%M}"
class ProximityState(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="proximity_as_owner",
        on_delete=models.CASCADE,
    )
    viewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="proximity_as_viewer",
        on_delete=models.CASCADE,
    )
    is_nearby = models.BooleanField(default=False)
    changed_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "viewer"], name="unique_proximity_state"
            ),
        ]
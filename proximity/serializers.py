from django.contrib.auth import get_user_model
from rest_framework import serializers
from django.utils import timezone
from .models import Friendship, LocationShare

User = get_user_model()


class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "display_name")


class FriendshipSerializer(serializers.ModelSerializer):
    from_user = UserMiniSerializer(read_only=True)
    to_user = UserMiniSerializer(read_only=True)

    class Meta:
        model = Friendship
        fields = ("id", "from_user", "to_user", "status", "created_at")
        read_only_fields = ("status", "created_at")


class FriendRequestCreateSerializer(serializers.Serializer):
    username = serializers.CharField()

    def validate_username(self, value):
        request_user = self.context["request"].user

        try:
            target = User.objects.get(username=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("No user with that username.")

        if target == request_user:
            raise serializers.ValidationError("You cannot friend yourself.")

        exists = Friendship.objects.filter(
            from_user__in=[request_user, target],
            to_user__in=[request_user, target],
        ).exists()
        if exists:
            raise serializers.ValidationError(
                "A friendship or request already exists with this user."
            )

        self.target = target
        return value


class LocationShareSerializer(serializers.ModelSerializer):
    owner = UserMiniSerializer(read_only=True)
    viewer = UserMiniSerializer(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = LocationShare
        fields = (
            "id", "owner", "viewer", "precision",
            "expires_at", "is_paused", "is_active", "created_at",
        )
        read_only_fields = ("created_at","is_paused")

    def validate_expires_at(self, value):
        if value and value <= timezone.now():
            raise serializers.ValidationError(
                "Expiry must be in the future."
        )
        return value


class LocationShareCreateSerializer(serializers.Serializer):
    username = serializers.CharField()
    precision = serializers.ChoiceField(
        choices=LocationShare.Precision.choices,
        default=LocationShare.Precision.PROXIMITY_ONLY,
    )
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_username(self, value):
        request_user = self.context["request"].user

        try:
            target = User.objects.get(username=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("No user with that username.")

        if target == request_user:
            raise serializers.ValidationError("You cannot share with yourself.")

        is_friend = Friendship.objects.filter(
            from_user__in=[request_user, target],
            to_user__in=[request_user, target],
            status=Friendship.Status.ACCEPTED,
        ).exists()
        if not is_friend:
            raise serializers.ValidationError(
                "You can only share your location with accepted friends."
            )

        if LocationShare.objects.filter(
            owner=request_user, viewer=target
        ).exists():
            raise serializers.ValidationError(
                "You are already sharing with this user."
            )

        self.target = target
        return value

    def validate_expires_at(self, value):
        if value and value <= timezone.now():
            raise serializers.ValidationError(
                "Expiry must be in the future."
            )
        return value

class LocationUpdateSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_m = serializers.FloatField(required=False, allow_null=True)
    battery_pct = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=100
    )
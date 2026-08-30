from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Friendship

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
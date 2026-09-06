from django.contrib.auth import get_user_model
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

User = get_user_model()


class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "display_name", "date_joined")
        read_only_fields = ("id", "username", "date_joined")


class RegisterSerializer(serializers.Serializer):
    username = serializers.RegexField(
        r"^[a-zA-Z0-9_]{3,30}$",
        error_messages={
            "invalid": "Use 3–30 letters, numbers or underscores."
        },
    )
    display_name = serializers.CharField(max_length=60, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("That username is taken.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            display_name=validated_data.get("display_name", ""),
            password=validated_data["password"],
        )
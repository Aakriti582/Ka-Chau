from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction

from .models import Friendship, LocationShare
from .serializers import FriendshipSerializer, FriendRequestCreateSerializer, LocationShareSerializer,LocationShareCreateSerializer


class FriendshipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FriendshipSerializer
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        user = self.request.user
        return (Friendship.objects
                .filter(Q(from_user=user) | Q(to_user=user))
                .select_related("from_user", "to_user"))

    def create(self, request):
        serializer = FriendRequestCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        friendship = Friendship.objects.create(
            from_user=request.user,
            to_user=serializer.target,
            status=Friendship.Status.PENDING,
        )
        return Response(
            FriendshipSerializer(friendship).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"])
    def pending(self, request):
        qs = self.get_queryset().filter(
            to_user=request.user, status=Friendship.Status.PENDING
        )
        return Response(FriendshipSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        friendship = self.get_object()

        if friendship.to_user != request.user:
            return Response(
                {"detail": "Only the recipient can accept this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if friendship.status != Friendship.Status.PENDING:
            return Response(
                {"detail": f"Request is already {friendship.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        friendship.status = Friendship.Status.ACCEPTED
        friendship.save(update_fields=["status"])
        return Response(FriendshipSerializer(friendship).data)

    @action(detail=True, methods=["post"]
                )
    def reject(self, request, pk=None):
        friendship = self.get_object()

        if friendship.to_user != request.user:
            return Response(
                {"detail": "Only the recipient can reject this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if friendship.status != Friendship.Status.PENDING:
            return Response(
                {"detail": f"Request is already {friendship.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        friendship.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def remove(self, request, pk=None):
        friendship = self.get_object()

        if friendship.status != Friendship.Status.ACCEPTED:
            return Response(
                {"detail": "This friendship is not active."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        a, b = friendship.from_user, friendship.to_user

        with transaction.atomic():
            LocationShare.objects.filter(
                owner__in=[a, b], viewer__in=[a, b]
            ).delete()
            friendship.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)

class LocationShareViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = LocationShareSerializer
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        user = self.request.user
        return (LocationShare.objects
                .filter(owner=user)
                .select_related("owner", "viewer"))

    def create(self, request):
        serializer = LocationShareCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        share = LocationShare.objects.create(
            owner=request.user,
            viewer=serializer.target,
            precision=serializer.validated_data["precision"],
            expires_at=serializer.validated_data.get("expires_at"),
        )
        return Response(
            LocationShareSerializer(share).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"])
    def shared_with_me(self, request):
        qs = (LocationShare.objects
              .filter(viewer=request.user)
              .select_related("owner", "viewer"))
        return Response(LocationShareSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        share = self.get_object()
        share.is_paused = True
        share.save(update_fields=["is_paused"])
        return Response(LocationShareSerializer(share).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        share = self.get_object()
        share.is_paused = False
        share.save(update_fields=["is_paused"])
        return Response(LocationShareSerializer(share).data)
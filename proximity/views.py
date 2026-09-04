from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Friendship, LastKnownLocation, LocationShare
from .serializers import (
    FriendshipSerializer,
    FriendRequestCreateSerializer,
    LocationShareSerializer,
    LocationShareCreateSerializer,
    LocationUpdateSerializer,
    UserMiniSerializer,
)

User = get_user_model()


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

    @action(detail=True, methods=["post"])
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

    @action(detail=False, methods=["get"])
    def friends(self, request):
        me = request.user
        accepted = self.get_queryset().filter(status=Friendship.Status.ACCEPTED)
        shares = {s.viewer_id: s for s in LocationShare.objects.filter(owner=me)}

        out = []
        for f in accepted:
            other = f.to_user if f.from_user_id == me.id else f.from_user
            share = shares.get(other.id)
            out.append({
                "friendship_id": f.id,
                "user": UserMiniSerializer(other).data,
                "my_share": LocationShareSerializer(share).data if share else None,
            })
        return Response(out)

    @action(detail=False, methods=["get"])
    def find(self, request):
        username = request.query_params.get("username", "").strip()
        if not username:
            return Response(
                {"detail": "username required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(username__iexact=username).first()
        if user is None or user == request.user:
            return Response({"found": False})

        existing = Friendship.objects.filter(
            from_user__in=[request.user, user],
            to_user__in=[request.user, user],
        ).first()

        return Response({
            "found": True,
            "user": UserMiniSerializer(user).data,
            "existing_status": existing.status if existing else None,
        })

    @action(detail=False, methods=["get"])
    def sent(self, request):
        qs = self.get_queryset().filter(
            from_user=request.user, status=Friendship.Status.PENDING
        )
        return Response(FriendshipSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        friendship = self.get_object()

        if friendship.from_user != request.user:
            return Response(
                {"detail": "Only the sender can cancel this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if friendship.status != Friendship.Status.PENDING:
            return Response(
                {"detail": f"Request is already {friendship.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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


class LocationViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def create(self, request):
        serializer = LocationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        point = Point(
            data["longitude"], data["latitude"], srid=4326
        )

        LastKnownLocation.objects.update_or_create(
            user=request.user,
            defaults={
                "point": point,
                "accuracy_m": data.get("accuracy_m"),
                "battery_pct": data.get("battery_pct"),
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


NEARBY_RADIUS_KM = 2
FRESHNESS_MINUTES = 15


class NearbyViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        me = request.user

        try:
            my_location = LastKnownLocation.objects.get(user=me)
        except LastKnownLocation.DoesNotExist:
            return Response(
                {"detail": "Your location is unknown. Send a location update first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cutoff = timezone.now() - timedelta(minutes=FRESHNESS_MINUTES)

        shares = (LocationShare.objects
            .filter(viewer=me, is_paused=False)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
            .select_related("owner"))

        precision_by_owner = {s.owner_id: s.precision for s in shares}
        all_locations = {
            loc.user_id: loc
            for loc in LastKnownLocation.objects.filter(
                user_id__in=precision_by_owner.keys()
            )
        }

        locations = (LastKnownLocation.objects
            .filter(user_id__in=precision_by_owner.keys())
            .filter(point__distance_lte=(my_location.point, D(km=NEARBY_RADIUS_KM)))
            .filter(updated_at__gte=cutoff)
            .annotate(dist=Distance("point", my_location.point))
            .select_related("user")
            .order_by("dist"))

        results = []
        for loc in locations:
            precision = precision_by_owner[loc.user_id]
            entry = {
                "user": UserMiniSerializer(loc.user).data,
                "updated_at": loc.updated_at,
                "precision": precision,
            }

            if precision == LocationShare.Precision.EXACT:
                entry["latitude"] = loc.point.y
                entry["longitude"] = loc.point.x
                entry["distance_m"] = round(loc.dist.m)
            elif precision == LocationShare.Precision.APPROX:
                entry["distance_m"] = round(loc.dist.m, -2)
            else:
                entry["nearby"] = True
                entry["distance_bucket"] = (
                    "under_500m" if loc.dist.m < 500
                    else "under_1km" if loc.dist.m < 1000
                    else "under_2km"
                )

            results.append(entry)

        nearby_ids = {loc.user_id for loc in locations}

        stale = []
        for share in shares:
            if share.owner_id in nearby_ids:
                continue

            owner_loc = all_locations.get(share.owner_id)
            if owner_loc is None:
                stale.append({
                    "user": UserMiniSerializer(share.owner).data,
                    "reason": "never_shared_location",
                    "updated_at": None,
                })
            elif owner_loc.updated_at < cutoff:
                stale.append({
                    "user": UserMiniSerializer(share.owner).data,
                    "reason": "stale",
                    "updated_at": owner_loc.updated_at,
                })

        paused_count = LocationShare.objects.filter(
            viewer=me, is_paused=True
        ).count()

        return Response({
            "nearby": results,
            "stale": stale,
            "counts": {
                "sharing_with_me": len(precision_by_owner),
                "nearby": len(results),
                "stale": len(stale),
                "paused": paused_count,
            },
        })
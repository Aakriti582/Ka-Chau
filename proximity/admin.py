from django.contrib import admin
from .models import Friendship, LocationShare, LastKnownLocation, ProximityState


@admin.register(Friendship)
class FriendshipAdmin(admin.ModelAdmin):
    list_display = ("from_user", "to_user", "status", "created_at")
    list_filter = ("status",)


@admin.register(LocationShare)
class LocationShareAdmin(admin.ModelAdmin):
    list_display = ("owner", "viewer", "precision", "expires_at", "is_paused")
    list_filter = ("precision", "is_paused")


@admin.register(LastKnownLocation)
class LastKnownLocationAdmin(admin.ModelAdmin):
    list_display = ("user", "updated_at", "accuracy_m", "battery_pct")


@admin.register(ProximityState)
class ProximityStateAdmin(admin.ModelAdmin):
    list_display = ("owner", "viewer", "is_nearby", "changed_at")
    list_filter = ("is_nearby",)
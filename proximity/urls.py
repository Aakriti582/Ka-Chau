from rest_framework.routers import DefaultRouter
from .views import (FriendshipViewSet, LocationShareViewSet, LocationViewSet,
NearbyViewSet)


router = DefaultRouter()
router.register("friendships", FriendshipViewSet, basename="friendship")
router.register("shares", LocationShareViewSet, basename="share")
router.register("locations", LocationViewSet, basename="location")
router.register("nearby", NearbyViewSet, basename="nearby")

urlpatterns = router.urls
from rest_framework.routers import DefaultRouter
from .views import FriendshipViewSet, LocationShareViewSet


router = DefaultRouter()
router.register("friendships", FriendshipViewSet, basename="friendship")
router.register("shares", LocationShareViewSet, basename="share")

urlpatterns = router.urls
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny,IsAuthenticated
from rest_framework import generics
from .serializers import MeSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import RegisterSerializer



REFRESH_COOKIE = "kachau_refresh"




class MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MeSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return self.request.user


def set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        REFRESH_COOKIE,
        str(refresh_token),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="None" if not settings.DEBUG else "Lax",
        max_age=30 * 24 * 60 * 60,
        path="/api/auth/",
    )


class CookieLoginView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop("refresh", None)
        if refresh:
            set_refresh_cookie(response, refresh)
        return response


class CookieRefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw = request.COOKIES.get(REFRESH_COOKIE)
        if not raw:
            return Response(
                {"detail": "No refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            old = RefreshToken(raw)
            new_refresh = RefreshToken(str(old))
            # rotation
            access = str(new_refresh.access_token)
        except TokenError:
            response = Response(
                {"detail": "Invalid refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            response.delete_cookie(REFRESH_COOKIE, path="/api/auth/")
            return response

        response = Response({"access": access})
        set_refresh_cookie(response, new_refresh)
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_COOKIE, path="/api/auth/")
        return response
class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "register"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        response = Response(
            {"access": str(refresh.access_token)},
            status=status.HTTP_201_CREATED,
        )
        set_refresh_cookie(response, refresh)
        return response
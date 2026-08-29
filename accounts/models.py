from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    display_name = models.CharField(max_length=60, blank=True)
    push_token = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.username
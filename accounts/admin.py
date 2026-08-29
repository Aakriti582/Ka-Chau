from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Ka Chau", {"fields": ("display_name", "push_token")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("Ka Chau", {"fields": ("display_name",)}),
    )
    list_display = ("username", "display_name", "email", "is_staff")
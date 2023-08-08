from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import path

from .consumers import Client

application = ProtocolTypeRouter({
    "websocket": URLRouter([
        path("ws/chat/", Client.as_asgi()),
    ]),
})
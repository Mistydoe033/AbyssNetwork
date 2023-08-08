import json
from channels.generic.websocket import AsyncWebsocketConsumer

class Client(AsyncWebsocketConsumer):
    connected_clients = set()  # Set to store connected clients

    async def connect(self):
        await self.accept()

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message_type = text_data_json.get('type')
        
        if message_type == 'username':
            username = text_data_json.get('username')
            self.connected_clients.add(username)  # Add username to connected_clients set
            
            # Broadcast the updated connected_clients list to all clients
            await self.send(text_data=json.dumps({
                'type': 'connected_clients',
                'clients': list(self.connected_clients)
            }))

class ChatSocket {
  socket: WebSocket;
  subscriptions: Record<string, Function[]>;

  constructor() {
    this.socket = new WebSocket('ws://192.168.1.200:8000/ws/chat/');
    this.subscriptions = {};

    this.socket.onopen = () => {
      console.log('WebSocket connection opened.');
    };

    this.socket.onmessage = this.handleReceivedMessage.bind(this);

    this.socket.onclose = () => {
      console.log('WebSocket connection closed.');
    };
  }

  setupOnOpenHandler(handler: () => void) {
    this.socket.onopen = handler;
  }

  subscribe(event: string, callback: Function) {
    this.subscriptions[event] = this.subscriptions[event] || [];
    this.subscriptions[event].push(callback);
  }

  unsubscribe(event: string, callback: Function) {
    this.subscriptions[event] = (this.subscriptions[event] || []).filter(cb => cb !== callback);
  }

  handleReceivedMessage(event: MessageEvent) {
    const data = JSON.parse(event.data);
    const { type } = data;
    const eventCallbacks = this.subscriptions[type] || [];
    eventCallbacks.forEach(callback => callback(data));
  }

  send(data: any) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else {
      console.error('WebSocket is not open.');
    }
  }
}

const SocketInstance = new ChatSocket();

export { SocketInstance };

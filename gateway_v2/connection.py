import asyncio
from bleak import BleakScanner, BleakClient

SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

class BLEClient:
    def __init__(self, device, global_callback):
        self.device = device
        self.name = device.name
        self.address = device.address
        self.client = BleakClient(device.address)
        self.global_callback = global_callback
        self.connected = False

    async def connect(self):
        try:
            print(f"🔄 Connecting to {self.name}...")
            await self.client.connect()
            self.connected = True
            print(f"✅ Connected: {self.name}")
            
            await self.client.start_notify(CHAR_UUID, self._notification_handler)
            return True
        except Exception as e:
            print(f"❌ Failed to connect {self.name}: {e}")
            self.connected = False
            return False

    async def disconnect(self):
        if self.connected:
            await self.client.disconnect()
            self.connected = False
            print(f"🔌 Disconnected: {self.name}")

    def _notification_handler(self, sender, data):
        # Inject Device Name into callback
        if self.global_callback:
            self.global_callback(self.name, data)


class MultiBLEManager:
    def __init__(self, target_prefix="DernDee"):
        self.target_prefix = target_prefix
        self.clients = {} # {address: BLEClient}
        self.data_callback = None
        self.top_level_callback = None

    async def scan_and_connect(self, callback):
        self.top_level_callback = callback
        print(f"🔍 Scanning for devices with '{self.target_prefix}'...")
        
        try:
            devices = await BleakScanner.discover()
        except Exception as e:
            print(f"❌ Scan Error: {e}")
            return

        for d in devices:
            if d.name and self.target_prefix in d.name:
                if d.address not in self.clients:
                    print(f"   > Found New: {d.name} ({d.address})")
                    # Create new client
                    client = BLEClient(d, self.top_level_callback)
                    success = await client.connect()
                    if success:
                        self.clients[d.address] = client
                else:
                    print(f"   > Already Known: {d.name}")

    async def keep_alive(self):
        while True:
            # Check connection status, maybe re-scan if lost?
            # For MVP, just sleep. In production, add Reconnect Logic.
            await asyncio.sleep(5)
            # Optional: Periodic Rescan to find remaining sensors
            await self.scan_and_connect(self.top_level_callback)

    async def disconnect_all(self):
        for addr, client in self.clients.items():
            await client.disconnect()

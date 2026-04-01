import asyncio
import websockets

async def test():
    uri = "ws://127.0.0.1:8765"
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ CONNECTION SUCCESS: Successfully connected to WebSocket!")
            await websocket.send("HELLO")
    except Exception as e:
        print(f"❌ CONNECTION FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test())

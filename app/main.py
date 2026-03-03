"""
999 PRO - Local Network Order Receiver System
Version 1.0 - Professional Terminal Edition
"""

import os
import sys
import webbrowser
import qrcode
import socket
import uuid
import json
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import uvicorn

# Create FastAPI app
app = FastAPI(title="999 PRO Terminal", version="1.0")

# Paths
BASE_DIR = Path(__file__).parent.parent
STATIC_DIR = BASE_DIR / "app" / "static"
TEMPLATES_DIR = BASE_DIR / "app" / "templates"
UPLOADS_DIR = BASE_DIR / "uploads"
ORDERS_FILE = BASE_DIR / "orders.json"

# Ensure directories exist
UPLOADS_DIR.mkdir(exist_ok=True)
(STATIC_DIR / "sounds").mkdir(parents=True, exist_ok=True)
(STATIC_DIR / "images").mkdir(parents=True, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Templates
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Store orders in memory and persist to file
orders_data: list = []

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()


def load_orders():
    """Load orders from JSON file"""
    global orders_data
    if ORDERS_FILE.exists():
        try:
            with open(ORDERS_FILE, 'r', encoding='utf-8') as f:
                orders_data = json.load(f)
        except:
            orders_data = []


def save_orders():
    """Save orders to JSON file"""
    with open(ORDERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(orders_data, f, ensure_ascii=False, indent=2)


def get_local_ip():
    """Get local IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def generate_qr_code(ip: str, port: int = 8000):
    """Generate QR code for client send page"""
    import os

if os.getenv("RENDER"):
    url = "https://printbox.onrender.com/send"
else:
    url = f"http://{ip}:{port}/send"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1a1a2e", back_color="white")
    
    qr_path = STATIC_DIR / "images" / "qrcode.png"
    img.save(str(qr_path))
    return url


# Load orders on startup
load_orders()


# ============ ROUTES ============

@app.get("/", response_class=HTMLResponse)
async def root_redirect():
    """Redirect root to panel for operator"""
    return HTMLResponse(content="""
        <script>window.location.href = '/panel';</script>
    """)


@app.get("/send", response_class=HTMLResponse)
async def client_page(request: Request):
    """Client page - file upload interface (for phones via QR)"""
    return templates.TemplateResponse("client.html", {"request": request})


@app.get("/panel", response_class=HTMLResponse)
async def operator_panel(request: Request):
    """Operator panel - main program interface"""
    local_ip = get_local_ip()
    return templates.TemplateResponse("panel.html", {
        "request": request,
        "local_ip": local_ip
    })


@app.get("/api/orders")
async def get_orders():
    """Get all orders"""
    return JSONResponse(content={"orders": orders_data})


@app.get("/api/orders/search")
async def search_orders(q: str = ""):
    """Search orders by name or ID"""
    if not q:
        return JSONResponse(content={"orders": orders_data})
    
    q_lower = q.lower()
    filtered = [
        order for order in orders_data
        if q_lower in order.get("name", "").lower() or q_lower in order.get("id", "").lower()
    ]
    return JSONResponse(content={"orders": filtered})


@app.post("/api/upload")
async def upload_files(
    name: str = Form(...),
    files: list[UploadFile] = File(...)
):
    """Handle file upload"""
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    
    name = name.strip()
    random_id = str(uuid.uuid4())[:6].upper()
    order_id = f"{name}_{random_id}"
    
    # Create folder: uploads/YYYY-MM-DD/NAME_ID/
    today = datetime.now().strftime("%Y-%m-%d")
    folder_path = UPLOADS_DIR / today / order_id
    folder_path.mkdir(parents=True, exist_ok=True)
    
    # Save files
    saved_files = []
    for file in files:
        if file.filename:
            # Clean filename
            safe_filename = "".join(c for c in file.filename if c.isalnum() or c in "._- ")
            file_path = folder_path / safe_filename
            
            # Read and save
            content = await file.read()
            with open(file_path, 'wb') as f:
                f.write(content)
            saved_files.append(safe_filename)
    
    # Create order record
    order = {
        "id": order_id,
        "name": name,
        "date": today,
        "time": datetime.now().strftime("%H:%M:%S"),
        "folder": str(folder_path.relative_to(BASE_DIR)),
        "file_count": len(saved_files),
        "files": saved_files
    }
    
    orders_data.insert(0, order)  # Add to beginning
    save_orders()
    
    # Broadcast new order to all connected operator panels
    await manager.broadcast({
        "type": "new_order",
        "order": order
    })
    
    return JSONResponse(content={
        "success": True,
        "order_id": order_id,
        "file_count": len(saved_files)
    })


@app.delete("/api/orders/{order_id}")
async def delete_order(order_id: str):
    """Delete an order"""
    import shutil
    
    for i, order in enumerate(orders_data):
        if order["id"] == order_id:
            # Delete folder
            folder_path = BASE_DIR / order["folder"]
            if folder_path.exists():
                shutil.rmtree(folder_path)
            
            # Remove from list
            orders_data.pop(i)
            save_orders()
            
            # Broadcast deletion
            await manager.broadcast({
                "type": "delete_order",
                "order_id": order_id
            })
            
            return JSONResponse(content={"success": True})
    
    raise HTTPException(status_code=404, detail="Order not found")


@app.get("/api/open-folder/{order_id}")
async def open_folder(order_id: str):
    """Open order folder in file explorer"""
    for order in orders_data:
        if order["id"] == order_id:
            folder_path = BASE_DIR / order["folder"]
            if folder_path.exists():
                if sys.platform == "win32":
                    os.startfile(str(folder_path))
                elif sys.platform == "darwin":
                    os.system(f'open "{folder_path}"')
                else:
                    os.system(f'xdg-open "{folder_path}"')
                return JSONResponse(content={"success": True})
    
    raise HTTPException(status_code=404, detail="Order not found")


@app.get("/qrcode")
async def get_qrcode():
    """Serve QR code image"""
    qr_path = STATIC_DIR / "images" / "qrcode.png"
    if qr_path.exists():
        return FileResponse(str(qr_path), media_type="image/png")
    raise HTTPException(status_code=404, detail="QR code not found")


# ============ WEBSOCKET ============

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for live updates"""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ============ STARTUP ============

def start_server():
    """Start the server"""
    ip = get_local_ip()
    port = 8000
    client_url = "https://printbox.onrender.com"
    generate_qr_code_from_url(client_url)
    panel_url = f"http://127.0.0.1:{port}/panel"
    
    print("\n" + "=" * 60)
    print("   999 PRO TERMINAL v1.0 - Order Receiver System")
    print("=" * 60)
    print(f"\n   📡 Local IP: {ip}")
    print(f"   🔗 Client URL (QR): {client_url}")
    print(f"   🖥️  Operator Panel: {panel_url}")
    print("\n" + "=" * 60)
    print("   Press Ctrl+C to stop the server")
    print("=" * 60 + "\n")
    
    # Open operator panel in browser
    import threading
    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open(panel_url)
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run server
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")


if __name__ == "__main__":
    start_server()

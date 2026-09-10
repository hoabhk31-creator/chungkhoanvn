"""
Institutional Equity Research Matrix (IERM) - Launcher
"""

import sys
import time
import webbrowser
import threading
import uvicorn


def open_browser():
    time.sleep(1.5)
    print("Opening IERM Dashboard in default browser: http://127.0.0.1:8000 ...")
    webbrowser.open("http://127.0.0.1:8000")


def get_network_ip():
    try:
        import socket
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return "127.0.0.1"


def main():
    if "--test" in sys.argv:
        print("[IERM Test Mode] Checking server initialization...")
        from server import app
        from engine import PRESET_DATASETS
        print(f"[OK] App loaded successfully. Available presets: {list(PRESET_DATASETS.keys())}")
        sys.exit(0)

    lan_ip = get_network_ip()

    print("=" * 70)
    print("  INSTITUTIONAL EQUITY RESEARCH MATRIX (IERM) - VIETNAM FINTECH")
    print("=" * 70)
    print(f"  * Truy cập trên máy này:     http://localhost:8000")
    print(f"  * Link xem online mạng này:  http://{lan_ip}:8000")
    print("=" * 70)
    print("  (Bất kỳ điện thoại, máy tính nào trong cùng mạng Wi-Fi/LAN")
    print(f"   đều có thể mở link: http://{lan_ip}:8000 để xem trực tiếp)")
    print("=" * 70)
    print("Nhấn Ctrl+C để dừng server.")

    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False, log_level="info")


if __name__ == "__main__":
    main()

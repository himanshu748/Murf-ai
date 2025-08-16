"""
Murf AI Voice Agent - HTTPS Version for Microphone Access
This version runs with SSL to enable microphone access in browsers
"""

import ssl
from main import app

if __name__ == "__main__":
    import uvicorn
    
    # SSL configuration
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain("certs/cert.pem", "certs/key.pem")
    
    print("🚀 Starting HTTPS server for microphone access...")
    print("🌐 Access at: https://localhost:8443")
    print("⚠️  You'll see a security warning - click 'Advanced' and 'Proceed to localhost'")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8443,
        ssl_certfile="certs/cert.pem",
        ssl_keyfile="certs/key.pem",
        reload=False  # Disable reload for HTTPS
    )

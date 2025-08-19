"""
WebSocket Manager for Murf AI Voice Agent
Handles WebSocket connections, message broadcasting, and session management
"""

import json
import logging
from typing import Dict, List, Set
from datetime import datetime

from fastapi import WebSocket
from models.message_models import WebSocketMessage, ErrorResponse

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Manages WebSocket connections and message broadcasting"""
    
    def __init__(self):
        # Active WebSocket connections
        self.active_connections: Set[WebSocket] = set()
        
        # Session to WebSocket mapping
        self.session_connections: Dict[str, Set[WebSocket]] = {}
        
        # Connection metadata
        self.connection_metadata: Dict[WebSocket, Dict] = {}
    
    async def connect(self, websocket: WebSocket):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        
        # Initialize connection metadata
        self.connection_metadata[websocket] = {
            "connected_at": datetime.utcnow(),
            "session_id": None,
            "last_activity": datetime.utcnow()
        }
        
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        
        # Remove from session connections
        session_to_cleanup = None
        for session_id, connections in list(self.session_connections.items()):
            if websocket in connections:
                connections.remove(websocket)
                if not connections:  # Mark empty session for deletion
                    session_to_cleanup = session_id
                break
        if session_to_cleanup is not None:
            try:
                del self.session_connections[session_to_cleanup]
            except KeyError:
                pass
        
        # Remove metadata
        if websocket in self.connection_metadata:
            del self.connection_metadata[websocket]
        
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def send_message(self, websocket: WebSocket, message: dict):
        """Send a message to a specific WebSocket"""
        try:
            # Update last activity
            if websocket in self.connection_metadata:
                self.connection_metadata[websocket]["last_activity"] = datetime.utcnow()
            
            # Ensure timestamp is present
            if "timestamp" not in message:
                message["timestamp"] = datetime.utcnow().isoformat()
            
            await websocket.send_text(json.dumps(message))
            logger.debug(f"Sent message type '{message.get('type')}' to WebSocket")
            
        except Exception as e:
            logger.error(f"Error sending message to WebSocket: {str(e)}")
            # Connection is likely broken, remove it
            self.disconnect(websocket)
    
    async def send_error(self, websocket: WebSocket, error_message: str, error_code: str = None):
        """Send an error message to a specific WebSocket"""
        error_response = {
            "type": "error",
            "error": True,
            "message": error_message,
            "error_code": error_code,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.send_message(websocket, error_response)
    
    async def broadcast_message(self, message: dict, exclude_websocket: WebSocket = None):
        """Broadcast a message to all connected WebSockets"""
        disconnected_websockets = []
        
        for websocket in self.active_connections:
            if websocket != exclude_websocket:
                try:
                    await self.send_message(websocket, message)
                except Exception as e:
                    logger.error(f"Error broadcasting to WebSocket: {str(e)}")
                    disconnected_websockets.append(websocket)
        
        # Clean up disconnected WebSockets
        for websocket in disconnected_websockets:
            self.disconnect(websocket)
    
    async def send_to_session(self, session_id: str, message: dict):
        """Send a message to all WebSockets in a specific session"""
        if session_id not in self.session_connections:
            logger.warning(f"No connections found for session {session_id}")
            return
        
        disconnected_websockets = []
        connections = self.session_connections[session_id].copy()
        
        for websocket in connections:
            try:
                await self.send_message(websocket, message)
            except Exception as e:
                logger.error(f"Error sending to session {session_id}: {str(e)}")
                disconnected_websockets.append(websocket)
        
        # Clean up disconnected WebSockets
        for websocket in disconnected_websockets:
            self.disconnect(websocket)
    
    def add_to_session(self, websocket: WebSocket, session_id: str):
        """Add a WebSocket to a session"""
        if session_id not in self.session_connections:
            self.session_connections[session_id] = set()
        
        self.session_connections[session_id].add(websocket)
        
        # Update connection metadata
        if websocket in self.connection_metadata:
            self.connection_metadata[websocket]["session_id"] = session_id
        
        logger.info(f"Added WebSocket to session {session_id}")
    
    def remove_from_session(self, websocket: WebSocket, session_id: str):
        """Remove a WebSocket from a session"""
        if session_id in self.session_connections:
            self.session_connections[session_id].discard(websocket)
            
            # Remove empty session
            if not self.session_connections[session_id]:
                del self.session_connections[session_id]
        
        # Update connection metadata
        if websocket in self.connection_metadata:
            self.connection_metadata[websocket]["session_id"] = None
        
        logger.info(f"Removed WebSocket from session {session_id}")
    
    def get_connection_count(self) -> int:
        """Get the number of active connections"""
        return len(self.active_connections)
    
    def get_session_count(self) -> int:
        """Get the number of active sessions"""
        return len(self.session_connections)
    
    def get_session_connections(self, session_id: str) -> int:
        """Get the number of connections in a session"""
        if session_id in self.session_connections:
            return len(self.session_connections[session_id])
        return 0
    
    def get_connection_info(self, websocket: WebSocket) -> dict:
        """Get metadata for a specific connection"""
        return self.connection_metadata.get(websocket, {})
    
    def get_stats(self) -> dict:
        """Get WebSocket manager statistics"""
        return {
            "total_connections": len(self.active_connections),
            "total_sessions": len(self.session_connections),
            "session_details": {
                session_id: len(connections) 
                for session_id, connections in self.session_connections.items()
            },
            "timestamp": datetime.utcnow().isoformat()
        }

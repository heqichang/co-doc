import asyncio
import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Document, PermissionRole
from app.utils.security import get_current_user_from_token
from app.utils.permissions import check_document_permission, get_user_role_in_document
from app.utils.redis_client import get_redis

COLLABORATOR_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"
]

class Collaborator:
    def __init__(self, user: User, websocket: WebSocket, color: str):
        self.user = user
        self.websocket = websocket
        self.color = color
        self.cursor = None
        self.selection = None
        self.last_heartbeat = datetime.now()

class DocumentSession:
    def __init__(self, document_id: int):
        self.document_id = document_id
        self.collaborators: Dict[int, Collaborator] = {}
        self.color_index = 0
    
    def get_next_color(self) -> str:
        color = COLLABORATOR_COLORS[self.color_index % len(COLLABORATOR_COLORS)]
        self.color_index += 1
        return color
    
    async def add_collaborator(self, user: User, websocket: WebSocket) -> Collaborator:
        color = self.get_next_color()
        collaborator = Collaborator(user, websocket, color)
        self.collaborators[user.id] = collaborator
        await self.broadcast_presence()
        return collaborator
    
    async def remove_collaborator(self, user_id: int):
        if user_id in self.collaborators:
            del self.collaborators[user_id]
            await self.broadcast_presence()
    
    async def broadcast_presence(self):
        presence_data = {
            "type": "presence",
            "data": {
                "document_id": self.document_id,
                "collaborators": [
                    {
                        "user_id": collab.user.id,
                        "nickname": collab.user.nickname,
                        "avatar": collab.user.avatar,
                        "color": collab.color,
                        "cursor": collab.cursor,
                        "selection": collab.selection
                    }
                    for collab in self.collaborators.values()
                ]
            }
        }
        await self.broadcast(json.dumps(presence_data))
    
    async def broadcast(self, message: str, exclude_user_id: Optional[int] = None):
        for collab in self.collaborators.values():
            if exclude_user_id and collab.user.id == exclude_user_id:
                continue
            try:
                await collab.websocket.send_text(message)
            except:
                pass

class CollaborationManager:
    def __init__(self):
        self.sessions: Dict[int, DocumentSession] = {}
    
    def get_session(self, document_id: int) -> DocumentSession:
        if document_id not in self.sessions:
            self.sessions[document_id] = DocumentSession(document_id)
        return self.sessions[document_id]
    
    async def remove_session_if_empty(self, document_id: int):
        session = self.sessions.get(document_id)
        if session and len(session.collaborators) == 0:
            del self.sessions[document_id]

collaboration_manager = CollaborationManager()

async def handle_collaboration(
    websocket: WebSocket,
    document_id: int,
    token: str,
    db: Session = Depends(get_db)
):
    await websocket.accept()
    
    try:
        user = await get_current_user_from_token(token, db)
        if not user:
            await websocket.send_json({"type": "error", "message": "认证失败"})
            await websocket.close()
            return
        
        await check_document_permission(document_id, PermissionRole.VIEWER, user, db)
        
        session = collaboration_manager.get_session(document_id)
        collaborator = await session.add_collaborator(user, websocket)
        
        user_role = get_user_role_in_document(document_id, user, db)
        await websocket.send_json({
            "type": "init",
            "data": {
                "user_id": user.id,
                "role": user_role.value if user_role else "viewer",
                "color": collaborator.color
            }
        })
        
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"document:{document_id}:sync")
        
        async def listen_redis():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await websocket.send_text(message["data"])
        
        redis_task = asyncio.create_task(listen_redis())
        
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    message_type = message.get("type")
                    
                    collaborator.last_heartbeat = datetime.now()
                    
                    if message_type == "sync":
                        sync_data = json.dumps({
                            "type": "sync",
                            "data": message.get("data"),
                            "user_id": user.id
                        })
                        await redis.publish(f"document:{document_id}:sync", sync_data)
                        await session.broadcast(sync_data, exclude_user_id=user.id)
                    
                    elif message_type == "cursor":
                        collaborator.cursor = message.get("data")
                        await session.broadcast_presence()
                    
                    elif message_type == "selection":
                        collaborator.selection = message.get("data")
                        await session.broadcast_presence()
                    
                    elif message_type == "heartbeat":
                        pass
                    
                    elif message_type == "notification":
                        notification = json.dumps({
                            "type": "notification",
                            "data": message.get("data"),
                            "user_id": user.id,
                            "timestamp": datetime.now().isoformat()
                        })
                        await session.broadcast(notification)
                    
                    elif message_type == "save_yjs":
                        yjs_state = message.get("data")
                        doc = db.query(Document).filter(Document.id == document_id).first()
                        if doc:
                            doc.yjs_state = yjs_state
                            db.commit()
                
                except json.JSONDecodeError:
                    pass
        
        except WebSocketDisconnect:
            pass
        finally:
            redis_task.cancel()
            await pubsub.unsubscribe(f"document:{document_id}:sync")
            await session.remove_collaborator(user.id)
            await collaboration_manager.remove_session_if_empty(document_id)
    
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except:
            pass

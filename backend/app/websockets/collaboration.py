import asyncio
import json
from datetime import datetime
from typing import Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Document, PermissionRole
from app.utils.security import get_current_user_from_token
from app.utils.permissions import check_document_permission
from app.utils.redis_client import get_redis


class Collaborator:
    def __init__(self, user: User, websocket: WebSocket):
        self.user = user
        self.websocket = websocket
        self.last_heartbeat = datetime.now()


class DocumentSession:
    def __init__(self, document_id: int):
        self.document_id = document_id
        self.collaborators: Dict[int, Collaborator] = {}
    
    async def add_collaborator(self, user: User, websocket: WebSocket) -> Collaborator:
        collaborator = Collaborator(user, websocket)
        self.collaborators[user.id] = collaborator
        return collaborator
    
    async def remove_collaborator(self, user_id: int):
        if user_id in self.collaborators:
            del self.collaborators[user_id]
    
    async def broadcast_bytes(self, data: bytes, exclude_user_id: Optional[int] = None):
        for collab in list(self.collaborators.values()):
            if exclude_user_id and collab.user.id == exclude_user_id:
                continue
            try:
                await collab.websocket.send_bytes(data)
            except Exception:
                pass
    
    async def broadcast_text(self, message: str, exclude_user_id: Optional[int] = None):
        for collab in list(self.collaborators.values()):
            if exclude_user_id and collab.user.id == exclude_user_id:
                continue
            try:
                await collab.websocket.send_text(message)
            except Exception:
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
        
        redis = await get_redis()
        redis_channel = f"document:{document_id}:yjs"
        pubsub = redis.pubsub()
        await pubsub.subscribe(redis_channel)
        
        async def listen_redis():
            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            data = message["data"]
                            if isinstance(data, bytes):
                                await websocket.send_bytes(data)
                            else:
                                await websocket.send_text(data)
                        except Exception:
                            pass
            except asyncio.CancelledError:
                pass
        
        redis_task = asyncio.create_task(listen_redis())
        
        try:
            while True:
                try:
                    message = await websocket.receive()
                except WebSocketDisconnect:
                    break
                
                collaborator.last_heartbeat = datetime.now()
                
                if "bytes" in message:
                    data = message["bytes"]
                    await redis.publish(redis_channel, data)
                    await session.broadcast_bytes(data, exclude_user_id=user.id)
                elif "text" in message:
                    text = message["text"]
                    try:
                        parsed = json.loads(text)
                        msg_type = parsed.get("type")
                        
                        if msg_type == "save_yjs":
                            yjs_state = parsed.get("data")
                            doc = db.query(Document).filter(Document.id == document_id).first()
                            if doc:
                                doc.yjs_state = yjs_state
                                db.commit()
                        elif msg_type == "heartbeat":
                            pass
                        else:
                            await redis.publish(redis_channel, text)
                            await session.broadcast_text(text, exclude_user_id=user.id)
                    except json.JSONDecodeError:
                        await redis.publish(redis_channel, text)
                        await session.broadcast_text(text, exclude_user_id=user.id)
        
        except WebSocketDisconnect:
            pass
        finally:
            try:
                redis_task.cancel()
                await pubsub.unsubscribe(redis_channel)
            except Exception:
                pass
            await session.remove_collaborator(user.id)
            await collaboration_manager.remove_session_if_empty(document_id)
    
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close()
        except Exception:
            pass

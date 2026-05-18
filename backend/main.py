from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Query
from app.database import Base, engine, get_db
from app.routers import auth, documents, upload, permissions, comments
from app.websockets.collaboration import handle_collaboration

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Co-Doc 富文本编辑器 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(upload.router)
app.include_router(permissions.router)
app.include_router(comments.router)

@app.websocket("/ws/collaborate/{document_id}")
async def websocket_collaboration(
    websocket: WebSocket,
    document_id: int,
    token: str = Query(...)
):
    db = next(get_db())
    try:
        await handle_collaboration(websocket, document_id, token, db)
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "Co-Doc API 服务运行中"}

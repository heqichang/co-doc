from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import auth, documents, upload

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

@app.get("/")
def root():
    return {"message": "Co-Doc API 服务运行中"}

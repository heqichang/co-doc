from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from minio import Minio
from minio.error import S3Error
from io import BytesIO
import uuid
from app.config import get_settings
from app.models import User
from app.utils.security import get_current_user
from app.schemas import UploadResponse

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp", "bmp"}
MAX_FILE_SIZE = 10 * 1024 * 1024

def get_minio_client():
    settings = get_settings()
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure
    )

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@router.post("/image", response_model=UploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    if not file.filename or not allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的文件格式"
        )
    
    settings = get_settings()
    client = get_minio_client()
    
    try:
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
    except S3Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"存储服务错误: {str(e)}"
        )
    
    ext = file.filename.rsplit(".", 1)[1].lower()
    unique_filename = f"{uuid.uuid4()}.{ext}"
    
    try:
        file_content = await file.read()
        if len(file_content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="文件大小不能超过10MB"
            )
        
        client.put_object(
            bucket_name=settings.minio_bucket,
            object_name=unique_filename,
            data=BytesIO(file_content),
            length=len(file_content),
            content_type=file.content_type or f"image/{ext}"
        )
    except S3Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"上传失败: {str(e)}"
        )
    
    protocol = "https" if settings.minio_secure else "http"
    url = f"{protocol}://{settings.minio_endpoint}/{settings.minio_bucket}/{unique_filename}"
    
    return UploadResponse(url=url, filename=unique_filename)

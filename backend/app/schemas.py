from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional, List, Any
from enum import Enum

class PermissionRole(str, Enum):
    OWNER = "owner"
    EDITOR = "editor"
    COMMENTER = "commenter"
    VIEWER = "viewer"

class UserBase(BaseModel):
    email: EmailStr
    nickname: Optional[str] = "用户"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    nickname: Optional[str] = None
    avatar: Optional[str] = None

class UserResponse(UserBase):
    id: int
    avatar: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class DocumentBase(BaseModel):
    title: Optional[str] = "未命名文档"
    content: Optional[str] = None

class DocumentCreate(DocumentBase):
    pass

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    yjs_state: Optional[str] = None

class DocumentResponse(BaseModel):
    id: int
    title: str
    content: Optional[str] = None
    yjs_state: Optional[str] = None
    owner_id: int
    is_deleted: bool
    share_token: Optional[str] = None
    share_role: Optional[PermissionRole] = None
    created_at: datetime
    updated_at: datetime
    user_role: Optional[PermissionRole] = None
    
    class Config:
        from_attributes = True

class DocumentListResponse(BaseModel):
    id: int
    title: str
    owner_id: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    user_role: Optional[PermissionRole] = None
    
    class Config:
        from_attributes = True

class UploadResponse(BaseModel):
    url: str
    filename: str

class PermissionBase(BaseModel):
    user_id: int
    role: PermissionRole

class PermissionCreate(PermissionBase):
    pass

class PermissionUpdate(BaseModel):
    role: PermissionRole

class PermissionResponse(BaseModel):
    id: int
    document_id: int
    user_id: int
    user: UserResponse
    role: PermissionRole
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ShareCreate(BaseModel):
    role: PermissionRole = PermissionRole.VIEWER

class ShareResponse(BaseModel):
    share_token: str
    share_role: PermissionRole
    share_url: str

class InviteCreate(BaseModel):
    email: EmailStr
    role: PermissionRole = PermissionRole.VIEWER

class CommentBase(BaseModel):
    text: str

class CommentCreate(CommentBase):
    parent_id: Optional[int] = None
    selection: Optional[Any] = None

class CommentUpdate(BaseModel):
    text: Optional[str] = None
    is_resolved: Optional[bool] = None

class CommentResponse(BaseModel):
    id: int
    document_id: int
    author_id: int
    author: UserResponse
    parent_id: Optional[int] = None
    text: str
    selection: Optional[Any] = None
    is_resolved: bool
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    replies: List["CommentResponse"] = []
    
    class Config:
        from_attributes = True

class CollaboratorInfo(BaseModel):
    user_id: int
    nickname: str
    avatar: Optional[str] = None
    color: str
    cursor: Optional[Any] = None
    selection: Optional[Any] = None

class CollaboratorPresence(BaseModel):
    document_id: int
    collaborators: List[CollaboratorInfo]

class NotificationMessage(BaseModel):
    type: str
    message: str
    data: Optional[Any] = None
    timestamp: datetime = Field(default_factory=datetime.now)

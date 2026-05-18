import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User, Document, DocumentPermission, PermissionRole
from app.schemas import (
    PermissionCreate, PermissionUpdate, PermissionResponse,
    ShareCreate, ShareResponse, InviteCreate
)
from app.utils.security import get_current_user
from app.utils.permissions import check_document_permission, get_user_role_in_document

router = APIRouter(prefix="/api/documents/{doc_id}/permissions", tags=["permissions"])

@router.get("", response_model=List[PermissionResponse])
def list_permissions(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    permissions = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc_id
    ).all()
    
    return permissions

@router.post("", response_model=PermissionResponse)
def add_permission(
    doc_id: int,
    permission_data: PermissionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if doc.owner_id == permission_data.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文档所有者不需要添加权限"
        )
    
    existing = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc_id,
        DocumentPermission.user_id == permission_data.user_id
    ).first()
    
    if existing:
        existing.role = permission_data.role
        db.commit()
        db.refresh(existing)
        return existing
    
    new_permission = DocumentPermission(
        document_id=doc_id,
        user_id=permission_data.user_id,
        role=permission_data.role
    )
    db.add(new_permission)
    db.commit()
    db.refresh(new_permission)
    return new_permission

@router.put("/{permission_id}", response_model=PermissionResponse)
def update_permission(
    doc_id: int,
    permission_id: int,
    update_data: PermissionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    permission = db.query(DocumentPermission).filter(
        DocumentPermission.id == permission_id,
        DocumentPermission.document_id == doc_id
    ).first()
    
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在"
        )
    
    permission.role = update_data.role
    db.commit()
    db.refresh(permission)
    return permission

@router.delete("/{permission_id}")
def delete_permission(
    doc_id: int,
    permission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    permission = db.query(DocumentPermission).filter(
        DocumentPermission.id == permission_id,
        DocumentPermission.document_id == doc_id
    ).first()
    
    if not permission:
        db.delete(permission)
        db.commit()
    
    return {"message": "权限已删除"}

@router.post("/share", response_model=ShareResponse)
def create_share(
    doc_id: int,
    share_data: ShareCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    doc = db.query(Document).filter(Document.id == doc_id).first()
    
    if not doc.share_token:
        doc.share_token = secrets.token_urlsafe(32)
    
    doc.share_role = share_data.role
    db.commit()
    db.refresh(doc)
    
    share_url = f"/share/{doc.share_token}"
    
    return ShareResponse(
        share_token=doc.share_token,
        share_role=doc.share_role,
        share_url=share_url
    )

@router.delete("/share")
def revoke_share(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    doc = db.query(Document).filter(Document.id == doc_id).first()
    
    doc.share_token = None
    doc.share_role = None
    db.commit()
    
    return {"message": "分享已撤销"}

@router.post("/invite")
def invite_collaborator(
    doc_id: int,
    invite_data: InviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    user = db.query(User).filter(User.email == invite_data.email).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    existing = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc_id,
        DocumentPermission.user_id == user.id
    ).first()
    
    if existing:
        existing.role = invite_data.role
        db.commit()
        db.refresh(existing)
    else:
        new_permission = DocumentPermission(
            document_id=doc_id,
            user_id=user.id,
            role=invite_data.role
        )
        db.add(new_permission)
        db.commit()
        db.refresh(new_permission)
    
    return {"message": f"已邀请成功", "user_id": user.id, "role": invite_data.role}

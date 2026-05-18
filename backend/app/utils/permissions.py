from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Document, DocumentPermission, PermissionRole, User
from app.utils.security import get_current_user

async def check_document_permission(
    doc_id: int,
    required_role: PermissionRole,
    current_user: User,
    db: Session
) -> bool:
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在"
        )
    
    if doc.owner_id == current_user.id:
        return True
    
    permission = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc_id,
        DocumentPermission.user_id == current_user.id
    ).first()
    
    if not permission:
        if doc.share_token and doc.share_role:
            role_hierarchy = {
                PermissionRole.OWNER: 4,
                PermissionRole.EDITOR: 3,
                PermissionRole.COMMENTER: 2,
                PermissionRole.VIEWER: 1
            }
            if role_hierarchy.get(doc.share_role, 0) >= role_hierarchy.get(required_role, 0):
                return True
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有权限访问此文档"
        )
    
    role_hierarchy = {
        PermissionRole.OWNER: 4,
        PermissionRole.EDITOR: 3,
        PermissionRole.COMMENTER: 2,
        PermissionRole.VIEWER: 1
    }
    
    if role_hierarchy.get(permission.role, 0) >= role_hierarchy.get(required_role, 0):
        return True
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="没有权限执行此操作"
    )

def get_user_role_in_document(
    doc_id: int,
    user: User,
    db: Session
) -> PermissionRole:
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        return None
    
    if doc.owner_id == user.id:
        return PermissionRole.OWNER
    
    permission = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc_id,
        DocumentPermission.user_id == user.id
    ).first()
    
    if permission:
        return permission.role
    
    if doc.share_token and doc.share_role:
        return doc.share_role
    
    return None

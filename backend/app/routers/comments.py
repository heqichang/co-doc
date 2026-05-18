from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import User, Document, Comment, PermissionRole
from app.schemas import CommentCreate, CommentUpdate, CommentResponse
from app.utils.security import get_current_user
from app.utils.permissions import check_document_permission

router = APIRouter(prefix="/api/documents/{doc_id}/comments", tags=["comments"])

@router.get("", response_model=List[CommentResponse])
def list_comments(
    doc_id: int,
    include_resolved: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.VIEWER, current_user, db)
    
    query = db.query(Comment).filter(
        Comment.document_id == doc_id,
        Comment.parent_id == None
    )
    
    if not include_resolved:
        query = query.filter(Comment.is_resolved == False)
    
    comments = query.order_by(Comment.created_at.desc()).all()
    
    return comments

@router.post("", response_model=CommentResponse)
def create_comment(
    doc_id: int,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.COMMENTER, current_user, db)
    
    if comment_data.parent_id:
        parent_comment = db.query(Comment).filter(
            Comment.id == comment_data.parent_id,
            Comment.document_id == doc_id
        ).first()
        if not parent_comment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="父评论不存在"
            )
    
    new_comment = Comment(
        document_id=doc_id,
        author_id=current_user.id,
        parent_id=comment_data.parent_id,
        text=comment_data.text,
        selection=comment_data.selection
    )
    
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    return new_comment

@router.put("/{comment_id}", response_model=CommentResponse)
def update_comment(
    doc_id: int,
    comment_id: int,
    update_data: CommentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.document_id == doc_id
    ).first()
    
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="评论不存在"
        )
    
    if comment.author_id != current_user.id:
        check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    if update_data.text is not None:
        comment.text = update_data.text
    
    if update_data.is_resolved is not None and update_data.is_resolved != comment.is_resolved:
        comment.is_resolved = update_data.is_resolved
        if update_data.is_resolved:
            comment.resolved_at = datetime.now()
            comment.resolved_by = current_user.id
        else:
            comment.resolved_at = None
            comment.resolved_by = None
    
    db.commit()
    db.refresh(comment)
    
    return comment

@router.delete("/{comment_id}")
def delete_comment(
    doc_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.document_id == doc_id
    ).first()
    
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="评论不存在"
        )
    
    if comment.author_id != current_user.id:
        check_document_permission(doc_id, PermissionRole.OWNER, current_user, db)
    
    db.delete(comment)
    db.commit()
    
    return {"message": "评论已删除"}

@router.post("/{comment_id}/resolve", response_model=CommentResponse)
def resolve_comment(
    doc_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.COMMENTER, current_user, db)
    
    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.document_id == doc_id
    ).first()
    
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="评论不存在"
        )
    
    comment.is_resolved = True
    comment.resolved_at = datetime.now()
    comment.resolved_by = current_user.id
    
    db.commit()
    db.refresh(comment)
    
    return comment

@router.post("/{comment_id}/reopen", response_model=CommentResponse)
def reopen_comment(
    doc_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_document_permission(doc_id, PermissionRole.COMMENTER, current_user, db)
    
    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.document_id == doc_id
    ).first()
    
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="评论不存在"
        )
    
    comment.is_resolved = False
    comment.resolved_at = None
    comment.resolved_by = None
    
    db.commit()
    db.refresh(comment)
    
    return comment

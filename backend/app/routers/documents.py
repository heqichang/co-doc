from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import User, Document
from app.schemas import DocumentCreate, DocumentUpdate, DocumentResponse, DocumentListResponse
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/documents", tags=["documents"])

@router.post("", response_model=DocumentResponse)
def create_document(
    doc_data: DocumentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_doc = Document(
        title=doc_data.title or "未命名文档",
        content=doc_data.content,
        owner_id=current_user.id
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

@router.get("", response_model=List[DocumentListResponse])
def list_documents(
    search: Optional[str] = Query(None, description="按标题搜索"),
    include_deleted: bool = Query(False, description="是否包含已删除文档"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Document).filter(Document.owner_id == current_user.id)
    
    if not include_deleted:
        query = query.filter(Document.is_deleted == False)
    
    if search:
        query = query.filter(Document.title.ilike(f"%{search}%"))
    
    query = query.order_by(Document.updated_at.desc())
    return query.all()

@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.owner_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在"
        )
    
    return doc

@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: int,
    update_data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.owner_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在"
        )
    
    if update_data.title is not None:
        doc.title = update_data.title
    if update_data.content is not None:
        doc.content = update_data.content
    
    db.commit()
    db.refresh(doc)
    return doc

@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.owner_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在"
        )
    
    doc.is_deleted = True
    db.commit()
    return {"message": "文档已移至回收站"}

@router.post("/{doc_id}/restore")
def restore_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.owner_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在"
        )
    
    doc.is_deleted = False
    db.commit()
    return {"message": "文档已恢复"}

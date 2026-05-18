"""add collaboration tables

Revision ID: 0001
Revises: 
Create Date: 2026-05-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permissionrole') THEN
                CREATE TYPE permissionrole AS ENUM ('owner', 'editor', 'commenter', 'viewer');
            END IF;
        END$$;
    """)
    
    op.execute("""
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS yjs_state TEXT;
    """)
    
    op.execute("""
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS share_token VARCHAR(255);
    """)
    
    op.execute("""
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS share_role permissionrole;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'documents_share_token_key'
            ) THEN
                ALTER TABLE documents ADD CONSTRAINT documents_share_token_key UNIQUE (share_token);
            END IF;
        END$$;
    """)
    
    op.execute("""
        CREATE TABLE IF NOT EXISTS document_permissions (
            id SERIAL PRIMARY KEY,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role permissionrole NOT NULL DEFAULT 'viewer',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_document_permissions_document_id ON document_permissions(document_id);
    """)
    
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_document_permissions_user_id ON document_permissions(user_id);
    """)
    
    op.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            parent_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
            text TEXT NOT NULL,
            selection JSONB,
            is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
            resolved_at TIMESTAMPTZ,
            resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
    """)
    
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_comments_document_id ON comments(document_id);
    """)
    
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
    """)


def downgrade():
    op.drop_index(op.f('ix_comments_parent_id'), table_name='comments')
    op.drop_index(op.f('ix_comments_document_id'), table_name='comments')
    op.drop_index(op.f('ix_comments_author_id'), table_name='comments')
    op.drop_table('comments')
    
    op.drop_index(op.f('ix_document_permissions_user_id'), table_name='document_permissions')
    op.drop_index(op.f('ix_document_permissions_document_id'), table_name='document_permissions')
    op.drop_table('document_permissions')
    
    op.drop_constraint(None, 'documents', type_='unique')
    op.drop_column('documents', 'share_role')
    op.drop_column('documents', 'share_token')
    op.drop_column('documents', 'yjs_state')
    
    op.execute('DROP TYPE permissionrole')

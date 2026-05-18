import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import { documentAPI, uploadAPI, permissionAPI, commentAPI } from '../utils/api'
import { useCollaboration } from '../hooks/useCollaboration'
import { collaborationManager } from '../utils/collaboration'
import '../styles/editor.css'

const modules = {
  toolbar: [
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'align': [] }],
    [{ 'color': [] }, { 'background': [] }],
    ['link', 'image'],
    ['undo', 'redo'],
    ['clean']
  ],
  clipboard: {
    matchVisual: false
  },
  cursors: {
    hideDelayMs: 3000,
    showCursorWhenSelecting: true
  }
}

const formats = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'list', 'bullet',
  'align',
  'color', 'background',
  'link', 'image'
]

function imageHandler(quill) {
  const input = document.createElement('input')
  input.setAttribute('type', 'file')
  input.setAttribute('accept', 'image/*')
  input.click()

  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    try {
      const response = await uploadAPI.image(file)
      const url = response.data.url
      const range = quill.getSelection()
      if (range) {
        quill.insertEmbed(range.index, 'image', url)
      }
    } catch (err) {
      alert('图片上传失败，请检查 MinIO 服务是否开启')
    }
  }
}

export default function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState('viewer')
  const [userColor, setUserColor] = useState('#4ECDC4')
  const [showShareModal, setShowShareModal] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [shareInfo, setShareInfo] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  
  const quillRef = useRef(null)
  const quillInstanceRef = useRef(null)
  const titleInputRef = useRef(null)
  const lastTitleSaveRef = useRef(Date.now())

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      setUser(JSON.parse(userStr))
    } else {
      navigate('/login')
    }
  }, [navigate])

  const canEdit = userRole === 'owner' || userRole === 'editor'
  const canComment = canEdit || userRole === 'commenter'

  const { connected, collaborators, notifications } = useCollaboration(
    id,
    localStorage.getItem('token'),
    quillInstanceRef.current,
    user ? { ...user, color: userColor } : null
  )

  useEffect(() => {
    const loadDocument = async () => {
      if (!user) return
      
      try {
        const response = await documentAPI.get(id)
        const doc = response.data
        setTitle(doc.title)
        setUserRole(doc.user_role || 'viewer')
        
        if (quillRef.current) {
          const quill = quillRef.current.getEditor()
          quillInstanceRef.current = quill
          
          if (doc.content) {
            quill.root.innerHTML = doc.content
          }
          
          quill.getModule('toolbar').addHandler('image', () => imageHandler(quill))
          
          if (!canEdit) {
            quill.disable()
          }
        }
      } catch (err) {
        console.error('加载文档失败:', err)
        alert('加载文档失败')
        navigate('/documents')
      } finally {
        setLoading(false)
      }
    }
    loadDocument()
  }, [id, navigate, user, canEdit])

  useEffect(() => {
    const loadComments = async () => {
      if (!id) return
      try {
        const response = await commentAPI.list(id)
        setComments(response.data)
      } catch (err) {
        console.error('加载评论失败:', err)
      }
    }
    if (showComments) {
      loadComments()
    }
  }, [id, showComments])

  useEffect(() => {
    const loadPermissions = async () => {
      if (!id || userRole !== 'owner') return
      try {
        const [permRes, shareRes] = await Promise.all([
          permissionAPI.list(id),
          permissionAPI.createShare(id, { role: 'viewer' }).catch(() => null)
        ])
        setPermissions(permRes.data)
        if (shareRes) {
          setShareInfo(shareRes.data)
        }
      } catch (err) {
        console.error('加载权限失败:', err)
      }
    }
    loadPermissions()
  }, [id, userRole])

  const handleTitleChange = useCallback((e) => {
    const newTitle = e.target.value
    setTitle(newTitle)
    
    const now = Date.now()
    if (now - lastTitleSaveRef.current > 2000) {
      lastTitleSaveRef.current = now
      documentAPI.update(id, { title: newTitle || '未命名文档' })
    }
  }, [id])

  const handleContentChange = useCallback(() => {
    if (!canEdit) return
    
    const now = Date.now()
    if (now - lastTitleSaveRef.current > 5000) {
      lastTitleSaveRef.current = now
      if (quillInstanceRef.current) {
        const content = quillInstanceRef.current.root.innerHTML
        documentAPI.update(id, { content })
      }
    }
  }, [id, canEdit])

  const handleSave = useCallback(async () => {
    if (!canEdit) return
    try {
      const content = quillInstanceRef.current?.root.innerHTML || ''
      await documentAPI.update(id, { title: title || '未命名文档', content })
      alert('保存成功')
    } catch (err) {
      alert('保存失败')
    }
  }, [id, title, canEdit])

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim() || !canComment) return
    
    try {
      const selection = quillInstanceRef.current?.getSelection()
      await commentAPI.create(id, {
        text: newComment,
        selection: selection ? { index: selection.index, length: selection.length } : null
      })
      setNewComment('')
      const response = await commentAPI.list(id)
      setComments(response.data)
    } catch (err) {
      alert('添加评论失败')
    }
  }, [id, newComment, canComment])

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return
    
    try {
      await permissionAPI.invite(id, {
        email: inviteEmail,
        role: inviteRole
      })
      setInviteEmail('')
      const response = await permissionAPI.list(id)
      setPermissions(response.data)
      alert('邀请成功')
    } catch (err) {
      alert('邀请失败')
    }
  }, [id, inviteEmail, inviteRole])

  const handleRevokePermission = useCallback(async (permissionId) => {
    try {
      await permissionAPI.remove(id, permissionId)
      const response = await permissionAPI.list(id)
      setPermissions(response.data)
    } catch (err) {
      alert('移除权限失败')
    }
  }, [id])

  const handleUpdatePermission = useCallback(async (permissionId, newRole) => {
    try {
      await permissionAPI.update(id, permissionId, { role: newRole })
      const response = await permissionAPI.list(id)
      setPermissions(response.data)
    } catch (err) {
      alert('更新权限失败')
    }
  }, [id])

  const handleCopyShareLink = useCallback(() => {
    if (shareInfo) {
      const fullUrl = `${window.location.origin}${shareInfo.share_url}`
      navigator.clipboard.writeText(fullUrl)
      alert('分享链接已复制')
    }
  }, [shareInfo])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  if (loading) {
    return (
      <div className="editor-loading">
        <div>加载中...</div>
      </div>
    )
  }

  return (
    <div className="editor-page">
      <header className="editor-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate('/documents')}>
            ← 返回
          </button>
          <input
            ref={titleInputRef}
            type="text"
            className="title-input"
            value={title}
            onChange={handleTitleChange}
            placeholder="未命名文档"
            disabled={!canEdit}
          />
        </div>
        <div className="header-right">
          <div className="collaborators">
            {collaborators.map((collab) => (
              <div
                key={collab.clientId}
                className="collaborator-avatar"
                style={{ backgroundColor: collab.color }}
                title={collab.name}
              >
                {collab.avatar ? (
                  <img src={collab.avatar} alt={collab.name} />
                ) : (
                  collab.name?.charAt(0)?.toUpperCase()
                )}
              </div>
            ))}
          </div>
          
          <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● 已连接' : '○ 未连接'}
          </span>
          
          {canComment && (
            <button className="btn btn-secondary" onClick={() => setShowComments(!showComments)}>
              💬 评论 ({comments.filter(c => !c.is_resolved).length})
            </button>
          )}
          
          {userRole === 'owner' && (
            <button className="btn btn-primary" onClick={() => setShowShareModal(true)}>
              🔗 分享
            </button>
          )}
          
          {canEdit && (
            <button className="btn btn-primary" onClick={handleSave}>
              保存 (Ctrl+S)
            </button>
          )}
        </div>
      </header>

      <main className="editor-main">
        <div className={`editor-container ${showComments ? 'with-comments' : ''}`}>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={''}
            onChange={handleContentChange}
            modules={{
              ...modules,
              toolbar: canEdit ? {
                container: modules.toolbar,
                handlers: {
                  image: () => imageHandler(quillInstanceRef.current)
                }
              } : false
            }}
            formats={formats}
            placeholder={canEdit ? "开始编辑..." : "只读模式"}
            readOnly={!canEdit}
          />
        </div>

        {showComments && (
          <div className="comments-panel">
            <div className="comments-header">
              <h3>评论</h3>
              <button className="close-btn" onClick={() => setShowComments(false)}>×</button>
            </div>
            
            {canComment && (
              <div className="comment-input">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="添加评论..."
                />
                <button className="btn btn-primary btn-small" onClick={handleAddComment}>
                  发送
                </button>
              </div>
            )}
            
            <div className="comments-list">
              {comments.length === 0 ? (
                <div className="empty-comments">暂无评论</div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className={`comment-item ${comment.is_resolved ? 'resolved' : ''}`}>
                    <div className="comment-header">
                      <span className="comment-author">{comment.author.nickname}</span>
                      <span className="comment-time">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="comment-text">{comment.text}</div>
                    <div className="comment-actions">
                      {!comment.is_resolved && canComment && (
                        <button
                          className="btn-link"
                          onClick={() => commentAPI.resolve(id, comment.id).then(() => {
                            commentAPI.list(id).then(res => setComments(res.data))
                          })}
                        >
                          ✓ 解决
                        </button>
                      )}
                      {comment.is_resolved && canComment && (
                        <button
                          className="btn-link"
                          onClick={() => commentAPI.reopen(id, comment.id).then(() => {
                            commentAPI.list(id).then(res => setComments(res.data))
                          })}
                        >
                          ↺ 重新打开
                        </button>
                      )}
                    </div>
                    
                    {comment.replies?.length > 0 && (
                      <div className="comment-replies">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="comment-reply">
                            <span className="comment-author">{reply.author.nickname}</span>
                            <span className="comment-text">{reply.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>分享文档</h3>
              <button className="close-btn" onClick={() => setShowShareModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="share-section">
                <h4>链接分享</h4>
                {shareInfo && (
                  <div className="share-link">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}${shareInfo.share_url}`}
                    />
                    <button className="btn btn-primary" onClick={handleCopyShareLink}>
                      复制链接
                    </button>
                  </div>
                )}
              </div>

              <div className="invite-section">
                <h4>邀请协作者</h4>
                <div className="invite-input">
                  <input
                    type="email"
                    placeholder="输入邮箱地址"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="viewer">可查看</option>
                    <option value="commenter">可评论</option>
                    <option value="editor">可编辑</option>
                  </select>
                  <button className="btn btn-primary" onClick={handleInvite}>
                    邀请
                  </button>
                </div>
              </div>

              <div className="permissions-section">
                <h4>协作者列表</h4>
                <div className="permissions-list">
                  {permissions.map((perm) => (
                    <div key={perm.id} className="permission-item">
                      <div className="permission-user">
                        {perm.user.avatar && (
                          <img src={perm.user.avatar} alt={perm.user.nickname} />
                        )}
                        <span>{perm.user.nickname}</span>
                        <span className="user-email">({perm.user.email})</span>
                      </div>
                      <div className="permission-actions">
                        <select
                          value={perm.role}
                          onChange={(e) => handleUpdatePermission(perm.id, e.target.value)}
                        >
                          <option value="viewer">可查看</option>
                          <option value="commenter">可评论</option>
                          <option value="editor">可编辑</option>
                        </select>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleRevokePermission(perm.id)}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {notifications.length > 0 && (
        <div className="notifications">
          {notifications.slice(-3).map((notif, index) => (
            <div key={index} className="notification">
              {notif.data?.message || JSON.stringify(notif.data)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

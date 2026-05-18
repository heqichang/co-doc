import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import * as Y from 'yjs'
import { QuillBinding } from 'y-quill'
import Quill from 'quill'
import QuillCursors from 'quill-cursors'
import { fromUint8Array, toUint8Array } from 'js-base64'
import { documentAPI, uploadAPI, permissionAPI, commentAPI } from '../utils/api'
import '../styles/editor.css'

Quill.register('modules/cursors', QuillCursors)

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

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
]

function getUserColor(userId) {
  return COLORS[userId % COLORS.length]
}

export default function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState('viewer')
  const [showShareModal, setShowShareModal] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [shareInfo, setShareInfo] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [connected, setConnected] = useState(false)
  const [collaborators, setCollaborators] = useState([])
  
  const quillRef = useRef(null)
  const quillInstanceRef = useRef(null)
  const ydocRef = useRef(null)
  const bindingRef = useRef(null)
  const wsRef = useRef(null)
  const awarenessRef = useRef(new Map())
  const titleInputRef = useRef(null)
  const lastTitleSaveRef = useRef(Date.now())
  const reconnectTimerRef = useRef(null)

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

  const cleanupCollaboration = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    
    if (bindingRef.current) {
      try {
        bindingRef.current.destroy()
      } catch (e) {}
      bindingRef.current = null
    }
    if (ydocRef.current) {
      try {
        ydocRef.current.destroy()
      } catch (e) {}
      ydocRef.current = null
    }
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch (e) {}
      wsRef.current = null
    }
    awarenessRef.current.clear()
    setCollaborators([])
  }, [])

  const broadcastAwareness = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !user) return
    
    const selection = quillInstanceRef.current?.getSelection()
    const awarenessMsg = {
      type: 'awareness',
      data: {
        user: {
          id: user.id,
          name: user.nickname,
          avatar: user.avatar,
          color: getUserColor(user.id)
        },
        selection: selection || null
      }
    }
    wsRef.current.send(JSON.stringify(awarenessMsg))
  }, [user])

  const initCollaboration = useCallback((quill, docContent) => {
    if (!id || !user) return

    try {
      cleanupCollaboration()

      const ydoc = new Y.Doc()
      ydocRef.current = ydoc

      const ytext = ydoc.getText('quill')
      
      if (docContent && ytext.length === 0) {
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = docContent
        const plainText = tempDiv.innerText || tempDiv.textContent || ''
        if (plainText.length > 0) {
          ytext.insert(0, plainText)
        }
      }

      const binding = new QuillBinding(ytext, quill)
      bindingRef.current = binding

      const token = localStorage.getItem('token')
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/collaborate/${id}?token=${token}`

      const connectWS = () => {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('WebSocket 已连接')
          setConnected(true)
          broadcastAwareness()
        }

        ws.onclose = () => {
          console.log('WebSocket 已断开')
          setConnected(false)
          awarenessRef.current.clear()
          setCollaborators([])
          
          reconnectTimerRef.current = setTimeout(() => {
            connectWS()
          }, 3000)
        }

        ws.onerror = (error) => {
          console.error('WebSocket 错误:', error)
          setConnected(false)
        }

        ws.onmessage = (event) => {
          try {
            if (event.data instanceof Blob) {
              const reader = new FileReader()
              reader.onload = () => {
                try {
                  const arrayBuffer = reader.result
                  const update = new Uint8Array(arrayBuffer)
                  Y.applyUpdate(ydoc, update)
                } catch (e) {
                  console.error('应用更新失败:', e)
                }
              }
              reader.readAsArrayBuffer(event.data)
            } else if (typeof event.data === 'string') {
              const message = JSON.parse(event.data)
              
              if (message.type === 'awareness') {
                const { user: collabUser, selection } = message.data
                if (collabUser && collabUser.id !== user.id) {
                  awarenessRef.current.set(collabUser.id, {
                    ...collabUser,
                    selection,
                    lastUpdate: Date.now()
                  })
                  
                  const collabList = Array.from(awarenessRef.current.values())
                  setCollaborators(collabList)
                  
                  const cursors = quill.getModule('cursors')
                  if (cursors) {
                    const range = selection ? {
                      index: selection.index,
                      length: selection.length || 0
                    } : null
                    cursors.createCursor(
                      collabUser.id.toString(),
                      collabUser.name,
                      collabUser.color
                    )
                    if (range) {
                      cursors.moveCursor(collabUser.id.toString(), range)
                    } else {
                      cursors.removeCursor(collabUser.id.toString())
                    }
                  }
                }
              } else if (message.type === 'sync_step1') {
                const stateVector = toUint8Array(message.data)
                const update = Y.encodeStateAsUpdate(ydoc, stateVector)
                ws.send(JSON.stringify({
                  type: 'sync_step2',
                  data: fromUint8Array(update)
                }))
              } else if (message.type === 'sync_step2') {
                const update = toUint8Array(message.data)
                Y.applyUpdate(ydoc, update)
              }
            }
          } catch (e) {
            console.error('处理消息失败:', e)
          }
        }
      }

      connectWS()

      ydoc.on('update', (update, origin) => {
        if (origin !== 'remote' && wsRef.current?.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(update)
          } catch (e) {
            console.error('发送更新失败:', e)
          }
        }
      })

      quill.on('selection-change', () => {
        broadcastAwareness()
      })

      setInterval(() => {
        const now = Date.now()
        awarenessRef.current.forEach((value, key) => {
          if (now - value.lastUpdate > 30000) {
            awarenessRef.current.delete(key)
            const cursors = quill.getModule('cursors')
            if (cursors) {
              cursors.removeCursor(key.toString())
            }
          }
        })
        const collabList = Array.from(awarenessRef.current.values())
        setCollaborators(collabList)
      }, 10000)

    } catch (error) {
      console.error('初始化协作失败:', error)
    }
  }, [id, user, cleanupCollaboration, broadcastAwareness])

  useEffect(() => {
    const loadDocument = async () => {
      if (!user) return
      
      try {
        const response = await documentAPI.get(id)
        const doc = response.data
        setTitle(doc.title)
        setUserRole(doc.user_role || 'viewer')
        setLoading(false)
        
        if (quillRef.current && !quillInstanceRef.current) {
          const quill = quillRef.current.getEditor()
          quillInstanceRef.current = quill
          
          quill.getModule('toolbar').addHandler('image', () => imageHandler(quill))
          
          if (!canEdit) {
            quill.disable()
          }
          
          initCollaboration(quill, doc.content)
        }
      } catch (err) {
        console.error('加载文档失败:', err)
        alert('加载文档失败')
        navigate('/documents')
      }
    }
    loadDocument()

    return () => {
      cleanupCollaboration()
    }
  }, [id, navigate, user, canEdit, cleanupCollaboration, initCollaboration])

  useEffect(() => {
    if (loading || !quillRef.current || quillInstanceRef.current || !user) return

    const timer = setTimeout(() => {
      if (quillRef.current && !quillInstanceRef.current) {
        const quill = quillRef.current.getEditor()
        quillInstanceRef.current = quill
        
        quill.getModule('toolbar').addHandler('image', () => imageHandler(quill))
        
        if (!canEdit) {
          quill.disable()
        }
        
        documentAPI.get(id).then(response => {
          initCollaboration(quill, response.data.content)
        })
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [loading, user, canEdit, id, initCollaboration])

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
                key={collab.id}
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
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { documentAPI } from '../utils/api'
import '../styles/documentList.css'

export default function DocumentList() {
  const [documents, setDocuments] = useState([])
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      setUser(JSON.parse(userStr))
    }
  }, [])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const response = await documentAPI.list({
        search: search || undefined,
        include_deleted: showDeleted
      })
      setDocuments(response.data)
    } catch (err) {
      console.error('加载文档失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [search, showDeleted])

  const createDocument = async () => {
    try {
      const response = await documentAPI.create({ title: '未命名文档' })
      navigate(`/editor/${response.data.id}`)
    } catch (err) {
      alert('创建文档失败')
    }
  }

  const handleDelete = async (doc, e) => {
    e.stopPropagation()
    if (doc.is_deleted) {
      if (!confirm('确定要彻底删除这个文档吗？')) return
      try {
        await documentAPI.delete(doc.id)
        loadDocuments()
      } catch (err) {
        alert('删除失败')
      }
    } else {
      if (!confirm('确定要将这个文档移至回收站吗？')) return
      try {
        await documentAPI.delete(doc.id)
        loadDocuments()
      } catch (err) {
        alert('删除失败')
      }
    }
  }

  const handleRestore = async (doc, e) => {
    e.stopPropagation()
    try {
      await documentAPI.restore(doc.id)
      loadDocuments()
    } catch (err) {
      alert('恢复失败')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  return (
    <div className="document-list-page">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">Co-Doc</h1>
        </div>
        <div className="header-right">
          <span className="user-info">
            {user?.avatar && <img src={user.avatar} alt="avatar" className="avatar" />}
            {user?.nickname || user?.email}
          </span>
          <button className="logout-btn" onClick={handleLogout}>退出</button>
        </div>
      </header>

      <main className="main-content">
        <div className="toolbar">
          <button className="btn btn-primary" onClick={createDocument}>
            + 新建文档
          </button>
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索文档..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          <label className="deleted-filter">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            显示回收站
          </label>
        </div>

        {loading ? (
          <div className="loading">加载中...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <p>{search ? '没有找到匹配的文档' : '暂无文档，点击上方按钮创建'}</p>
          </div>
        ) : (
          <div className="document-grid">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`document-card ${doc.is_deleted ? 'deleted' : ''}`}
                onClick={() => !doc.is_deleted && navigate(`/editor/${doc.id}`)}
              >
                <div className="card-header">
                  <h3 className="document-title">{doc.title}</h3>
                </div>
                <div className="card-meta">
                  <span>更新于 {dayjs(doc.updated_at).format('YYYY-MM-DD HH:mm')}</span>
                </div>
                <div className="card-actions">
                  {doc.is_deleted ? (
                    <>
                      <button className="btn btn-small" onClick={(e) => handleRestore(doc, e)}>
                        恢复
                      </button>
                      <button className="btn btn-danger btn-small" onClick={(e) => handleDelete(doc, e)}>
                        彻底删除
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-danger btn-small" onClick={(e) => handleDelete(doc, e)}>
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

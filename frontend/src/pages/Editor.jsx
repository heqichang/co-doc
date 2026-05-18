import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import { documentAPI, uploadAPI } from '../utils/api'
import { useDebounce } from '../utils/hooks'
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

function imageHandler() {
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
      const quillEditor = document.querySelector('.ql-editor')
      if (quillEditor) {
        const quillInstance = window.quillRef?.getEditor()
        if (quillInstance) {
          const range = quillInstance.getSelection()
          if (range) {
            quillInstance.insertEmbed(range.index, 'image', url)
          }
        }
      }
    } catch (err) {
      alert('图片上传失败，请检查 MinIO 服务是否开启')
    }
  }
}

const modulesWithImage = {
  ...modules,
  toolbar: {
    container: modules.toolbar,
    handlers: {
      image: imageHandler
    }
  }
}

export default function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [titleInput, setTitleInput] = useState('')
  const isMounted = useRef(false)

  const saveDocument = useCallback(async (newTitle, newContent) => {
    setSaveStatus('saving')
    try {
      await documentAPI.update(id, {
        title: newTitle || '未命名文档',
        content: newContent
      })
      setSaveStatus('saved')
    } catch (err) {
      console.error('保存失败:', err)
      setSaveStatus('error')
    }
  }, [id])

  const debouncedSave = useDebounce((newTitle, newContent) => {
    saveDocument(newTitle, newContent)
  }, 3000)

  useEffect(() => {
    isMounted.current = true
    const loadDocument = async () => {
      try {
        const response = await documentAPI.get(id)
        const doc = response.data
        setTitle(doc.title)
        setTitleInput(doc.title)
        setContent(doc.content || '')
      } catch (err) {
        alert('加载文档失败')
        navigate('/documents')
      } finally {
        setLoading(false)
      }
    }
    loadDocument()

    return () => {
      isMounted.current = false
    }
  }, [id, navigate])

  const handleTitleChange = (e) => {
    const newTitle = e.target.value
    setTitleInput(newTitle)
    setSaveStatus('unsaved')
    debouncedSave(newTitle, content)
  }

  const handleContentChange = (newContent) => {
    setContent(newContent)
    setSaveStatus('unsaved')
    debouncedSave(titleInput, newContent)
  }

  const handleManualSave = useCallback(async (e) => {
    if (e) e.preventDefault()
    await saveDocument(titleInput, content)
  }, [titleInput, content, saveDocument])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        handleManualSave()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleManualSave])

  const getStatusText = () => {
    switch (saveStatus) {
      case 'saved': return '✓ 已保存'
      case 'saving': return '⏳ 保存中...'
      case 'error': return '✗ 保存失败'
      default: return '• 未保存'
    }
  }

  const getStatusClass = () => {
    switch (saveStatus) {
      case 'saved': return 'status-saved'
      case 'saving': return 'status-saving'
      case 'error': return 'status-error'
      default: return 'status-unsaved'
    }
  }

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
            type="text"
            className="title-input"
            value={titleInput}
            onChange={handleTitleChange}
            placeholder="未命名文档"
          />
        </div>
        <div className="header-right">
          <span className={`save-status ${getStatusClass()}`}>
            {getStatusText()}
          </span>
          <button className="save-btn" onClick={handleManualSave}>
            保存 (Ctrl+S)
          </button>
        </div>
      </header>

      <main className="editor-main">
        <ReactQuill
          theme="snow"
          value={content}
          onChange={handleContentChange}
          modules={modulesWithImage}
          formats={formats}
          placeholder="开始编辑..."
        />
      </main>
    </div>
  )
}

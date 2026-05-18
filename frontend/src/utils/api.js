import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updateMe: (data) => api.put('/auth/me', data)
}

export const documentAPI = {
  create: (data) => api.post('/documents', data),
  list: (params) => api.get('/documents', { params }),
  get: (id) => api.get(`/documents/${id}`),
  update: (id, data) => api.put(`/documents/${id}`, data),
  delete: (id, permanent = false) => api.delete(`/documents/${id}`, { params: { permanent } }),
  restore: (id) => api.post(`/documents/${id}/restore`),
  getByShareToken: (token) => api.get(`/documents/share/${token}`)
}

export const uploadAPI = {
  image: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}

export const permissionAPI = {
  list: (docId) => api.get(`/documents/${docId}/permissions`),
  add: (docId, data) => api.post(`/documents/${docId}/permissions`, data),
  update: (docId, permissionId, data) => api.put(`/documents/${docId}/permissions/${permissionId}`, data),
  remove: (docId, permissionId) => api.delete(`/documents/${docId}/permissions/${permissionId}`),
  createShare: (docId, data) => api.post(`/documents/${docId}/permissions/share`, data),
  revokeShare: (docId) => api.delete(`/documents/${docId}/permissions/share`),
  invite: (docId, data) => api.post(`/documents/${docId}/permissions/invite`, data)
}

export const commentAPI = {
  list: (docId, includeResolved = false) => api.get(`/documents/${docId}/comments`, { params: { include_resolved: includeResolved } }),
  create: (docId, data) => api.post(`/documents/${docId}/comments`, data),
  update: (docId, commentId, data) => api.put(`/documents/${docId}/comments/${commentId}`, data),
  remove: (docId, commentId) => api.delete(`/documents/${docId}/comments/${commentId}`),
  resolve: (docId, commentId) => api.post(`/documents/${docId}/comments/${commentId}/resolve`),
  reopen: (docId, commentId) => api.post(`/documents/${docId}/comments/${commentId}/reopen`)
}

export default api

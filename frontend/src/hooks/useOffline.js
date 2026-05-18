import { useState, useEffect, useCallback } from 'react'

const DB_NAME = 'codoc-offline'
const STORE_NAME = 'documents'

export function useOffline(documentId) {
  const [db, setDb] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [hasOfflineChanges, setHasOfflineChanges] = useState(false)
  const [pendingOperations, setPendingOperations] = useState([])

  useEffect(() => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = (event) => {
      setDb(event.target.result)
    }

    return () => {
      if (db) {
        db.close()
      }
    }
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      syncPendingOperations()
    }
    
    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const saveDocumentOffline = useCallback((documentData) => {
    if (!db) return
    
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    
    const data = {
      id: documentId,
      ...documentData,
      savedAt: Date.now()
    }
    
    store.put(data)
    
    setHasOfflineChanges(true)
  }, [db, documentId])

  const getOfflineDocument = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }
      
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(documentId)
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }, [db, documentId])

  const addPendingOperation = useCallback((operation) => {
    setPendingOperations(prev => [...prev, {
      ...operation,
      timestamp: Date.now(),
      id: `${operation.type}-${Date.now()}`
    }])
    setHasOfflineChanges(true)
    
    localStorage.setItem(`pending-${documentId}`, JSON.stringify([
      ...JSON.parse(localStorage.getItem(`pending-${documentId}`) || '[]'),
      { ...operation, timestamp: Date.now(), id: `${operation.type}-${Date.now()}` }
    ]))
  }, [documentId])

  const syncPendingOperations = useCallback(async () => {
    const stored = localStorage.getItem(`pending-${documentId}`)
    if (!stored) return
    
    const operations = JSON.parse(stored)
    if (operations.length === 0) return

    try {
      for (const op of operations) {
        switch (op.type) {
          case 'update':
            await fetch(`/api/documents/${documentId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify(op.data)
            })
            break
          case 'comment':
            await fetch(`/api/documents/${documentId}/comments`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify(op.data)
            })
            break
        }
      }
      
      localStorage.removeItem(`pending-${documentId}`)
      setPendingOperations([])
      setHasOfflineChanges(false)
      
      return true
    } catch (error) {
      console.error('同步失败:', error)
      return false
    }
  }, [documentId])

  const clearOfflineData = useCallback(() => {
    if (!db) return
    
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.delete(documentId)
    
    localStorage.removeItem(`pending-${documentId}`)
    setPendingOperations([])
    setHasOfflineChanges(false)
  }, [db, documentId])

  return {
    isOnline,
    hasOfflineChanges,
    pendingOperations,
    saveDocumentOffline,
    getOfflineDocument,
    addPendingOperation,
    syncPendingOperations,
    clearOfflineData
  }
}

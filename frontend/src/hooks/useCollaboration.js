import { useState, useEffect, useCallback, useRef } from 'react'
import { collaborationManager } from '../utils/collaboration'

export function useCollaboration(documentId, token, quill, userInfo) {
  const [connected, setConnected] = useState(false)
  const [collaborators, setCollaborators] = useState([])
  const [notifications, setNotifications] = useState([])
  const providerRef = useRef(null)

  useEffect(() => {
    if (!documentId || !token || !quill) return

    const setup = async () => {
      try {
        const { provider } = await collaborationManager.setupCollaboration(
          documentId,
          token,
          quill,
          userInfo
        )

        providerRef.current = provider

        provider.on('status', ({ status }) => {
          setConnected(status === 'connected')
        })

        provider.awareness.on('change', () => {
          const states = provider.awareness.getStates()
          const collabList = []
          states.forEach((state, clientId) => {
            if (state.user && state.user.id !== userInfo?.id) {
              collabList.push({
                ...state.user,
                clientId
              })
            }
          })
          setCollaborators(collabList)
        })

        const messageHandler = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === 'notification') {
              setNotifications(prev => [...prev, message])
            }
          } catch (e) {}
        }

        provider.on('message', messageHandler)

      } catch (error) {
        console.error('协作设置失败:', error)
      }
    }

    setup()

    return () => {
      collaborationManager.cleanup(documentId)
      providerRef.current = null
    }
  }, [documentId, token, quill, userInfo])

  const sendNotification = useCallback((message) => {
    if (documentId) {
      collaborationManager.sendNotification(documentId, message)
    }
  }, [documentId])

  const sendCursorPosition = useCallback((position) => {
    if (documentId) {
      collaborationManager.sendCursorPosition(documentId, position)
    }
  }, [documentId])

  const sendSelection = useCallback((selection) => {
    if (documentId) {
      collaborationManager.sendSelection(documentId, selection)
    }
  }, [documentId])

  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  return {
    connected,
    collaborators,
    notifications,
    sendNotification,
    sendCursorPosition,
    sendSelection,
    clearNotifications
  }
}

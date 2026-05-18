import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { QuillBinding } from 'y-quill'
import Quill from 'quill'
import QuillCursors from 'quill-cursors'

Quill.register('modules/cursors', QuillCursors)

class CollaborationManager {
  constructor() {
    this.ydocs = new Map()
    this.providers = new Map()
    this.bindings = new Map()
  }

  async setupCollaboration(documentId, token, quill, userInfo) {
    this.cleanup(documentId)

    const ydoc = new Y.Doc()
    this.ydocs.set(documentId, ydoc)

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsHost = window.location.host
    const wsUrl = `${wsProtocol}//${wsHost}/ws/collaborate/${documentId}?token=${token}`

    const provider = new WebsocketProvider(wsUrl, documentId.toString(), ydoc, {
      connect: true,
      params: { token }
    })
    this.providers.set(documentId, provider)

    const ytext = ydoc.getText('quill')

    const binding = new QuillBinding(ytext, quill, provider.awareness)
    this.bindings.set(documentId, binding)

    if (userInfo) {
      provider.awareness.setLocalStateField('user', {
        id: userInfo.id,
        name: userInfo.nickname,
        avatar: userInfo.avatar,
        color: userInfo.color
      })
    }

    return { ydoc, provider, binding }
  }

  getProvider(documentId) {
    return this.providers.get(documentId)
  }

  getYDoc(documentId) {
    return this.ydocs.get(documentId)
  }

  getAwareness(documentId) {
    const provider = this.providers.get(documentId)
    return provider?.awareness
  }

  sendCursorPosition(documentId, position) {
    const provider = this.providers.get(documentId)
    if (provider?.ws?.readyState === WebSocket.OPEN) {
      provider.ws.send(JSON.stringify({
        type: 'cursor',
        data: position
      }))
    }
  }

  sendSelection(documentId, selection) {
    const provider = this.providers.get(documentId)
    if (provider?.ws?.readyState === WebSocket.OPEN) {
      provider.ws.send(JSON.stringify({
        type: 'selection',
        data: selection
      }))
    }
  }

  sendNotification(documentId, message) {
    const provider = this.providers.get(documentId)
    if (provider?.ws?.readyState === WebSocket.OPEN) {
      provider.ws.send(JSON.stringify({
        type: 'notification',
        data: message
      }))
    }
  }

  saveYjsState(documentId) {
    const ydoc = this.ydocs.get(documentId)
    if (ydoc) {
      const state = Y.encodeStateAsUpdate(ydoc)
      return btoa(String.fromCharCode.apply(null, state))
    }
    return null
  }

  cleanup(documentId) {
    const binding = this.bindings.get(documentId)
    if (binding) {
      binding.destroy()
      this.bindings.delete(documentId)
    }

    const provider = this.providers.get(documentId)
    if (provider) {
      provider.destroy()
      this.providers.delete(documentId)
    }

    const ydoc = this.ydocs.get(documentId)
    if (ydoc) {
      ydoc.destroy()
      this.ydocs.delete(documentId)
    }
  }

  cleanupAll() {
    for (const documentId of this.ydocs.keys()) {
      this.cleanup(documentId)
    }
  }
}

export const collaborationManager = new CollaborationManager()

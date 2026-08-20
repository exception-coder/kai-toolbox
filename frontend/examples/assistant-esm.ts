import { initializeAssistant } from '../dist-assistant/kai-assistant.es.js'

export const assistant = initializeAssistant({
  appId: 'ERP',
  appName: 'ERP',
  wsUrl: '/assistant-ws',
  getAccessToken: () => window.getAssistantAccessToken(),
  visibility: {
    initiallyHidden: true,
    activationKey: 'erp-assistant',
  },
  draggable: true,
  user: {
    id: String(window.currentUser.id),
    displayName: window.currentUser.name,
  },
  page: {
    url: window.location.pathname,
    title: document.title,
  },
})

declare global {
  interface Window {
    currentUser: { id: string | number; name: string }
    getAssistantAccessToken: () => string | Promise<string>
  }
}

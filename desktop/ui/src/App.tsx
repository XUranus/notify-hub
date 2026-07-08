import { useApp } from './hooks/useApp'
import { TitleBar } from './components/TitleBar'
import { ConnectView } from './components/ConnectView'
import { Dashboard } from './components/Dashboard'
import { SettingsModal } from './components/SettingsModal'
import { ComposeModal } from './components/ComposeModal'
import { QuickSendModal } from './components/QuickSendModal'
import { OfflineDialog } from './components/OfflineDialog'
import { DeleteModal } from './components/DeleteModal'
import { Toast } from './components/Toast'

export default function App() {
  const app = useApp()

  return (
    <>
      <TitleBar
        T={app.T}
        invoke={app.invoke}
        connStatus={app.connStatus}
        onCompose={() => app.setComposeOpen(true)}
        onViewToggle={app.toggleViewMode}
        viewMode={app.viewMode}
        onSettings={() => app.setSettingsOpen(true)}
        setErrorDetailOpen={app.setErrorDetailOpen}
        showSearch={app.showSearch}
        onToggleSearch={() => {
          const newVal = !app.showSearch
          app.setShowSearch(newVal)
          if (!newVal) app.setSearchQuery('')
        }}
      />

      {app.currentView === 'connect' && (
        <ConnectView T={app.T} onConnect={app.handleConnect} showToast={app.showToast} />
      )}

      {app.currentView === 'dashboard' && (
        <Dashboard app={app} />
      )}

      <SettingsModal app={app} />
      <ComposeModal app={app} />
      <QuickSendModal app={app} />
      <OfflineDialog app={app} />
      <DeleteModal app={app} />
      <Toast toast={app.toast} />
    </>
  )
}

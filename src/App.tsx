/* PomeloLauncher DEMO — 应用外壳：标题栏 / 边栏 / 路由 / 弹层 */
import React, { useState } from 'react'
import { AppProvider, useApp, Page } from './store'
import { Icon, Logo, Toasts } from './ui'
import Home from './pages/Home'
import Instances from './pages/Instances'
import Resources from './pages/Resources'
import Downloads from './pages/Downloads'
import Accounts, { AddAccountModal } from './pages/Accounts'
import Settings from './pages/Settings'
import { Wizard, CrashModal, NewInstanceModal, InstallModal } from './overlays'
import { isDesktop, windowClose, windowMinimize, windowStartDragging, windowToggleMaximize } from './desktop'

const NAV: { key: Page; label: string; icon: string }[] = [
  { key: 'home', label: '首页', icon: 'home' },
  { key: 'instances', label: '实例', icon: 'grid' },
  { key: 'resources', label: '资源', icon: 'package' },
  { key: 'downloads', label: '下载', icon: 'download' },
  { key: 'accounts', label: '账户', icon: 'user' },
  { key: 'settings', label: '设置', icon: 'settings' },
]

/* 演示壁纸：像素柚园（几何场景，subject-world） */
const WALLPAPER = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" shape-rendering="crispEdges">
    <rect x="250" y="16" width="22" height="22" fill="#F2C14E"/>
    <rect x="0" y="120" width="320" height="60" fill="#8FBF4D"/>
    <rect x="0" y="138" width="140" height="42" fill="#6E9A38"/>
    <rect x="200" y="146" width="120" height="34" fill="#6E9A38"/>
    <rect x="60" y="86" width="10" height="36" fill="#8A6244"/>
    <rect x="40" y="60" width="50" height="30" fill="#5F8F35"/>
    <rect x="48" y="52" width="34" height="12" fill="#6FA23F"/>
    <rect x="52" y="70" width="7" height="7" fill="#F2C14E"/>
    <rect x="72" y="76" width="7" height="7" fill="#F2C14E"/>
    <rect x="240" y="96" width="8" height="26" fill="#8A6244"/>
    <rect x="226" y="76" width="36" height="22" fill="#5F8F35"/>
    <rect x="234" y="84" width="6" height="6" fill="#F2C14E"/>
    <rect x="250" y="88" width="6" height="6" fill="#F2C14E"/>
    <rect x="150" y="150" width="26" height="14" fill="#8A6244"/>
    <rect x="152" y="146" width="22" height="5" fill="#7BA23F"/>
  </svg>`
)

function Shell() {
  const app = useApp()
  const [maximized, setMaximized] = useState(false)
  const activeDl = app.downloads.filter(d => d.status === 'downloading').length

  const pages: Record<Page, React.ReactNode> = {
    home: <Home />, instances: <Instances />, resources: <Resources />,
    downloads: <Downloads />, accounts: <Accounts />, settings: <Settings />,
  }

  return (
    <div className={`desktop${isDesktop() ? ' desktop-mode' : ''}`}>
      <div className={`window${!isDesktop() && maximized ? ' maximized' : ''}`}>
        {/* 自定义标题栏 */}
        <div className="titlebar" data-tauri-drag-region
          onMouseDown={e => {
            if (!isDesktop() || e.button !== 0) return
            const t = e.target as HTMLElement
            if (t.closest('.winbtns') || t.closest('button') || t.closest('a') || t.closest('input')) return
            void windowStartDragging()
          }}
          onDoubleClick={() => { if (isDesktop()) void windowToggleMaximize() }}>
          <span className="logo" data-tauri-drag-region><Logo />PomeloLauncher</span>
          <span className="demo-badge" data-tauri-drag-region>{isDesktop() ? 'DESKTOP · 桌面版' : 'DEMO · 演示数据'}</span>
          <span className="spacer" data-tauri-drag-region />
          <div className="winbtns">
            <button className="winbtn" aria-label="最小化" onClick={() => isDesktop() ? void windowMinimize() : app.toast('演示模式：窗口不会真的最小化')}><Icon name="minimize" size={14} /></button>
            <button className="winbtn" aria-label="最大化" onClick={() => isDesktop() ? void windowToggleMaximize() : setMaximized(v => !v)}><Icon name="maximize" size={14} /></button>
            <button className="winbtn close" aria-label="关闭" onClick={() => isDesktop() ? void windowClose() : app.toast('演示模式：窗口不会真的关闭')}><Icon name="x" size={14} /></button>
          </div>
        </div>

        <div className="body-row">
          {/* 边栏 */}
          <nav className="sidebar" aria-label="主导航">
            {NAV.map(n => (
              <button key={n.key} className={`nav-item ${app.page === n.key ? 'active' : ''}`} onClick={() => app.go(n.key)}
                aria-current={app.page === n.key ? 'page' : undefined} style={{ position: 'relative' }}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.key === 'downloads' && activeDl > 0 && (
                  <span style={{ position: 'absolute', top: 6, right: 10, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} title={`${activeDl} 个下载进行中`} />
                )}
              </button>
            ))}
            <span className="spacer" />
            <button className="iconbtn" aria-label="切换深浅主题"
              onClick={() => app.setSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' })}>
              <Icon name={document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <span className="ver num">v0.1.0</span>
          </nav>

          {/* 内容区 */}
          <div className="content">
            {app.settings.wallpaper && <div className="wallpaper" style={{ backgroundImage: `url("${WALLPAPER}")` }} />}
            <div className="page-scroll">
              <div className="page-enter" key={app.page + (app.detailId ?? '')}>
                {pages[app.page]}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 弹层 */}
      {app.modal?.type === 'add-account' && <AddAccountModal />}
      {app.modal?.type === 'new-instance' && <NewInstanceModal />}
      {app.modal?.type === 'install' && <InstallModal res={app.modal.res} />}
      {app.modal?.type === 'crash' && <CrashModal />}
      {app.wizardOpen && <Wizard />}
      <Toasts items={app.toasts} />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}

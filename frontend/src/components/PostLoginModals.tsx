import { useState, useEffect } from 'react'
import WelcomeModal from './WelcomeModal'
import TutorialModal from './TutorialModal'

/**
 * 登录后根据 sessionStorage 展示一次欢迎语（账号首次登录）或教程（新 IP 首次登录）。
 * 由 Login 页在登录成功时写入 showWelcome / showTutorial，本组件在 ProtectedRoute 内挂载时检查并展示。
 */
export default function PostLoginModals() {
  const [showWelcome, setShowWelcome] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  useEffect(() => {
    const needWelcome = sessionStorage.getItem('showWelcome') === '1'
    const needTutorial = sessionStorage.getItem('showTutorial') === '1'
    sessionStorage.removeItem('showWelcome')
    sessionStorage.removeItem('showTutorial')
    if (needWelcome) setShowWelcome(true)
    else if (needTutorial) setShowTutorial(true)
  }, [])

  const [pendingTutorial, setPendingTutorial] = useState(false)

  useEffect(() => {
    const needWelcome = sessionStorage.getItem('showWelcome') === '1'
    const needTutorial = sessionStorage.getItem('showTutorial') === '1'
    sessionStorage.removeItem('showWelcome')
    sessionStorage.removeItem('showTutorial')
    if (needWelcome) setShowWelcome(true)
    if (needTutorial) {
      if (needWelcome) setPendingTutorial(true)
      else setShowTutorial(true)
    }
  }, [])

  const handleCloseWelcome = () => {
    setShowWelcome(false)
    if (pendingTutorial) {
      setShowTutorial(true)
      setPendingTutorial(false)
    }
  }

  if (showWelcome) {
    return <WelcomeModal onClose={handleCloseWelcome} />
  }
  if (showTutorial) {
    return <TutorialModal onClose={() => setShowTutorial(false)} />
  }
  return null
}

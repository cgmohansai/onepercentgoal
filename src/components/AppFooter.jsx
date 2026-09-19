import React from 'react'
import { GithubLogo } from '@phosphor-icons/react'

export function AppFooter({ year = 2026 }) {
  return (
    <footer className="app-main-footer">
      <div className="footer-left">
        <span>ONEPERCENTGOAL / {year}</span>
        <span className="footer-motto">Life changes 1% at a time.</span>
      </div>
      
      <div className="footer-social-icons">
        <a
          href="https://github.com/cgmohansai/onepercentgoal"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub Repository"
          aria-label="GitHub Repository"
          className="footer-icon-link"
        >
          <GithubLogo size={18} weight="fill" />
        </a>
      </div>
    </footer>
  )
}

export default AppFooter

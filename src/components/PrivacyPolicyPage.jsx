import React from 'react'
import SpotlightNavbar from './SpotlightNavbar'

const SECTIONS = [
  {
    title: 'Introduction',
    body: [
      'OnePercentGoal ("we," "our," or "the App") is a goal-setting and habit-tracking application designed to help users build better routines, manage goals, and track personal progress.',
      'This Privacy Policy explains how OnePercentGoal collects, uses, stores, and protects your information when you use our application.',
      'By using OnePercentGoal, you acknowledge the practices described in this Privacy Policy.',
    ],
  },
  {
    title: 'Information We Collect',
    body: [
      'Depending on the features you use, OnePercentGoal may collect or process the following information:',
    ],
    sub: [
      {
        heading: 'Account Information',
        text: 'When you sign in using Google, we may receive basic profile information such as your name, email address, and profile picture, subject to the permissions you grant.',
      },
      {
        heading: 'Goals and Habit Data',
        text: 'We store information you provide when using the App, including goals, daily habits (Rotes), completion status, progress, and related preferences.',
      },
      {
        heading: 'Notes and Profile Information',
        text: 'If you use notes, profile, or related features, the information you choose to save may be stored and associated with your account.',
      },
      {
        heading: 'Technical Information',
        text: 'Limited technical information may be processed to operate, maintain, and secure the App, troubleshoot errors, and support its functionality.',
      },
    ],
    footnote: 'We do not intentionally collect information that is unnecessary for the App\u2019s core functionality.',
  },
  {
    title: 'How We Use Your Information',
    body: [
      'We use the information collected to:',
    ],
    list: [
      'Create and manage your account.',
      'Save and display your goals, habits, notes, and progress.',
      'Provide the App\u2019s core features and personalize your experience.',
      'Maintain and improve the App\u2019s performance and reliability.',
      'Respond to support requests and address technical issues.',
      'Protect the App and its users against misuse.',
    ],
    footnote: 'We do not sell your personal information.',
  },
  {
    title: 'Google Sign-In',
    body: [
      'OnePercentGoal uses Google Sign-In for authentication.',
      'When you choose to sign in with Google, certain account information may be shared with us by Google to authenticate you and associate your account with your App data.',
      'Your use of Google Sign-In is also subject to Google\u2019s Privacy Policy: https://policies.google.com/privacy',
      'OnePercentGoal does not receive your Google account password through the Google Sign-In process.',
    ],
  },
  {
    title: 'Data Storage and Third-Party Services',
    body: [
      'Your account information and App data may be stored on servers used to operate OnePercentGoal.',
      'Our website and application infrastructure may use Vercel and other service providers to host, deliver, or maintain the service. Such providers may process information as necessary to provide their services.',
      'We do not authorize service providers to use your personal information for purposes unrelated to providing or maintaining the service.',
      'We do not sell or rent your personal information to third parties.',
    ],
  },
  {
    title: 'Data Sharing',
    body: [
      'We do not sell, rent, or trade your personal information.',
      'Information may be shared only when reasonably necessary to:',
    ],
    list: [
      'Provide and maintain the App through service providers.',
      'Authenticate your account through Google Sign-In.',
      'Protect the security and integrity of the App.',
      'Comply with applicable laws or valid legal requests.',
      'Protect our rights or address misuse of the service.',
    ],
  },
  {
    title: 'Data Retention and Deletion',
    body: [
      'We retain your account information and associated App data for as long as necessary to provide the service, maintain your account, and fulfill legitimate operational or legal requirements.',
      'You may request deletion of your OnePercentGoal account and associated personal data by contacting: mohansai7189@gmail.com',
      'Please use the subject line "OnePercentGoal Account Deletion Request" and include the email address associated with your account.',
      'We may need to verify your identity before processing a deletion request.',
      'Upon verification, we will process the request and delete the associated account data, subject to any applicable legal retention requirements. Any data that must be retained will be limited to what is legally necessary and retained only for the required period.',
      'Uninstalling the App does not, by itself, delete your account or associated data.',
    ],
  },
  {
    title: 'Data Security',
    body: [
      'We take reasonable measures to protect your information against unauthorized access, loss, misuse, or alteration.',
      'However, no method of electronic storage or internet transmission can be guaranteed to be completely secure.',
    ],
  },
  {
    title: "Children's Privacy",
    body: [
      'OnePercentGoal is not intended to knowingly collect personal information from children in violation of applicable laws.',
      'If you believe a child has provided personal information inappropriately, please contact us so that we can review the situation and take appropriate action.',
    ],
  },
  {
    title: 'Your Privacy Rights',
    body: [
      'Depending on your location and applicable laws, you may have rights to:',
    ],
    list: [
      'Request access to your personal information.',
      'Request correction of inaccurate information.',
      'Request deletion of your account and associated data.',
      'Ask questions about how your information is processed.',
    ],
    footnote: 'To exercise these rights, contact us using the email address below.',
  },
  {
    title: 'Changes to This Privacy Policy',
    body: [
      'We may update this Privacy Policy as OnePercentGoal evolves or when required by applicable laws.',
      'Any updated version will be published at the Privacy Policy URL associated with the App. The effective date will be updated accordingly.',
      'We encourage users to review this page periodically.',
    ],
  },
  {
    title: 'Contact Us',
    body: [
      'If you have any questions, concerns, or requests regarding this Privacy Policy or your personal information, please contact:',
    ],
    list: ['App Name: OnePercentGoal', 'Email: mohansai7189@gmail.com', 'Website: https://onepercentgoal.vercel.app'],
  },
]

export function PrivacyPolicyPage({ headerHidden }) {
  const goHome = () => {
    window.location.href = '/'
  }
  return (
    <main className="app-shell logged-out">
      <header className={`shell-header ${headerHidden ? 'header-hidden' : ''}`}>
        <SpotlightNavbar items={[]} />
      </header>

      <section className="content" key="content-privacy">
        <div className="workspace-page privacy-page-custom">
          <header className="goals-page-header">
            <div className="goals-badge-row">
              <span className="goals-sprint-badge">PRIVACY POLICY</span>
            </div>
            <div className="goals-title-action-row">
              <div className="goals-title-col">
                <h1 className="goals-sprint-title" style={{ margin: 0 }}>
                  <span className="title-main-text" style={{ whiteSpace: 'nowrap' }}>
                    Privacy <em>Policy</em>
                  </span>
                </h1>
                <div className="goals-sprint-dates" style={{ marginTop: '4px' }}>
                  Effective Date: September 24, 2026
                </div>
              </div>
              <button type="button" className="add-button" onClick={goHome}>
                ← Back Home
              </button>
            </div>
          </header>

          <section className="card privacy-policy-card">
            {SECTIONS.map((section, idx) => (
              <div className="privacy-section" key={section.title}>
                <h2>
                  <span className="privacy-section-num">{idx + 1}.</span> {section.title}
                </h2>
                {section.body?.map((para, i) => (
                  <p key={i}>{renderInlineLinks(para)}</p>
                ))}
                {section.sub?.map(item => (
                  <div className="privacy-sub" key={item.heading}>
                    <h3>{item.heading}</h3>
                    <p>{item.text}</p>
                  </div>
                ))}
                {section.list && (
                  <ul>
                    {section.list.map(item => (
                      <li key={item}>{renderInlineLinks(item)}</li>
                    ))}
                  </ul>
                )}
                {section.footnote && <p className="privacy-footnote">{section.footnote}</p>}
              </div>
            ))}
          </section>
        </div>
      </section>
    </main>
  )
}

function renderInlineLinks(text) {
  const urlPattern = /(https?:\/\/[^\s)]+)/g
  const emailPattern = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/
  const parts = String(text).split(urlPattern)
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      )
    }
    const emailSplit = part.split(emailPattern)
    if (emailSplit.length > 1) {
      return emailSplit.map((chunk, j) =>
        emailPattern.test(chunk) ? (
          <a key={`${i}-${j}`} href={`mailto:${chunk}?subject=OnePercentGoal%20Account%20Deletion%20Request`}>
            {chunk}
          </a>
        ) : (
          <span key={`${i}-${j}`}>{chunk}</span>
        )
      )
    }
    return <span key={i}>{part}</span>
  })
}

export default PrivacyPolicyPage

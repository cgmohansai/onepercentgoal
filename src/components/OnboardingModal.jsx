import React from 'react'

export const ONBOARDING_QUOTE = 'Small steps, repeated daily, become extraordinary progress.'

export function hasSeenOnboarding(userId) {
  try {
    if (!userId) return true
    return localStorage.getItem(`opg.onboarded.${userId}`) === '1'
  } catch {
    return true
  }
}

export function markOnboardingSeen(userId) {
  try {
    if (userId) localStorage.setItem(`opg.onboarded.${userId}`, '1')
  } catch {}
}

const STEPS = [
  { title: 'Create a goal', text: 'Tap + or “Create Sprint Goal”, give it a title — it joins your active sprint instantly.' },
  { title: 'Set its progress', text: 'Drag the slider on any goal to set its own 0–100%. Each goal tracks independently.' },
  { title: 'Add rotes', text: 'Add daily routines from the Rote tab. They reset every day.' },
  { title: 'Complete or Pass', text: 'Confirm a rote when done, or Pass to postpone it to tomorrow — no credit, no fuss.' },
  { title: 'Review & history', text: 'Open Timeline for sprint history and the Rote calendar for past days. Everything works offline and syncs later.' },
]

export function OnboardingModal({ onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to OnePercentGoal">
      <div className="modal-content onboarding-modal">
        <p className="eyebrow">WELCOME TO ONEPERCENTGOAL</p>
        <h2>
          Get started in <em>seconds</em>
        </h2>
        <ol className="onboarding-steps">
          {STEPS.map(step => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <blockquote className="onboarding-quote">‘{ONBOARDING_QUOTE}’</blockquote>
        <button type="button" className="onboarding-cta" onClick={onClose} autoFocus>
          Start my first sprint
        </button>
      </div>
    </div>
  )
}

export default OnboardingModal

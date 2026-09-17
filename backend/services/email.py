"""Email sending and notification services via Brevo."""
from __future__ import annotations

from datetime import datetime
import httpx

from backend.config import (
    IST,
    USE_POSTGRES,
    BREVO_API_KEY,
    BREVO_SENDER_EMAIL,
    EMAIL_LOGO_URL,
    FRONTEND_URL,
)
from backend.db.connection import execute


def send_email_via_brevo(to_email: str, subject: str, html_body: str) -> bool:
    """Send transactional email via Brevo REST API v3."""
    if not BREVO_API_KEY or not BREVO_SENDER_EMAIL:
        print("Brevo credentials are not configured. Skipping email send.")
        return False
    try:
        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": BREVO_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "sender": {"name": "OnePercentGoal", "email": BREVO_SENDER_EMAIL},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html_body,
            },
            timeout=10.0,
        )
        if response.status_code in (200, 201, 202):
            print(f"Successfully sent email to {to_email} via Brevo HTTP API")
            return True
        else:
            print(f"Failed to send email to {to_email} via Brevo: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"Error calling Brevo API: {e}")
        return False


def send_welcome_email(user_email: str, user_name: str):
    """Dispatch welcome onboarding email to new Google OAuth user."""
    subject = "Welcome to OnePercentGoal! Let's start compounding."
    logo_url = EMAIL_LOGO_URL if EMAIL_LOGO_URL else f"{FRONTEND_URL}/favicon.ico"
    html_body = f"""
    <div style="font-family: 'DM Sans', sans-serif; background: #141513; color: #f3f1ed; padding: 40px 24px; max-width: 580px; margin: 0 auto; border: 1px solid #2b2c28; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
        <div style="text-align: center; margin-bottom: 36px;">
            <img src="{logo_url}" alt="OnePercentGoal Logo" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block;" />
            <div style="font-family: 'DM Mono', monospace; font-size: 10px; color: #8e9088; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500;">ONEPERCENTGOAL</div>
        </div>
        <p style="font-family: 'DM Mono', monospace; font-size: 11px; color: #c9f36a; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; font-weight: 500;">ONEPERCENTGOAL ONBOARDING</p>
        <h1 style="font-size: 32px; font-weight: 600; color: #f6f5f1; letter-spacing: -0.05em; margin: 0 0 20px; font-family: 'Instrument Serif', serif; font-style: italic;">
            Welcome to OnePercentGoal, {user_name}!
        </h1>
        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin-bottom: 18px;">
            We're thrilled to have you here. OnePercentGoal is built around a single, powerful philosophy: 
            <strong>getting 1% better every sprint</strong>.
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin-bottom: 24px;">
            A year consists of 100 sprints (each sprint is exactly 3.6 days, representing 1% of the year). By completing your goals consistently, you leverage compounding growth, leading to a massive <strong>37.78x increase</strong> in capability by the end of the year.
        </p>
        
        <h3 style="color: #f6f5f1; font-size: 18px; margin-top: 28px; margin-bottom: 12px; font-weight: 500;">What you can do with the app:</h3>
        <ul style="padding-left: 20px; color: #a5a79e; font-size: 15px; line-height: 1.6; margin-bottom: 30px;">
            <li style="margin-bottom: 10px;">🎯 <strong>Create Sprint Goals</strong>: Set concrete, actionable goals for the current 3.6-day active sprint.</li>
            <li style="margin-bottom: 10px;">⏳ <strong>Track Progress In Real Time</strong>: Watch the compounding counter build up and count down towards the sprint limit.</li>
            <li style="margin-bottom: 10px;">🔄 <strong>Automatic Rollovers</strong>: Any goals left incomplete are automatically rolled over to the next sprint, ensuring nothing gets lost.</li>
            <li style="margin-bottom: 10px;">🔗 <strong>Share Your Profile</strong>: Copy your profile link to showcase your active goals and sprint history publicly with friends.</li>
        </ul>
        
        <div style="text-align: center; margin-top: 30px;">
            <a href="{FRONTEND_URL}" style="display: inline-block; background: #c9f36a; color: #121411; text-decoration: none; padding: 12px 28px; border-radius: 99px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 15px rgba(201, 243, 106, 0.2);">
                Launch Your First Sprint
            </a>
        </div>
        <div style="border-top: 1px solid #2f322b; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #8c9085; font-family: 'DM Mono', monospace; text-align: center;">
            1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS
        </div>
    </div>
    """
    send_email_via_brevo(user_email, subject, html_body)


def log_sent_reminder(conn, user_id: int, year: int, sprint: int, rtype: str):
    """Record email notification sent state to prevent duplicate emails."""
    if USE_POSTGRES:
        execute(
            conn,
            "INSERT INTO sprint_email_reminders (user_id, sprint_year, sprint_number, reminder_type, sent_at) VALUES (%s, %s, %s, %s, NOW()) ON CONFLICT DO NOTHING",
            (user_id, year, sprint, rtype),
        )
    else:
        execute(
            conn,
            "INSERT OR IGNORE INTO sprint_email_reminders (user_id, sprint_year, sprint_number, reminder_type, sent_at) VALUES (%s, %s, %s, %s, %s)",
            (user_id, year, sprint, rtype, datetime.now(IST).isoformat()),
        )

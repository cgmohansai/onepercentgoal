"""OnePercentGoal — Standalone Email Scheduler & Sprint Notification Worker.

Architecture:
- Decoupled from FastAPI web process to prevent multi-worker duplicate loops.
- Provides 12h and 6h sprint countdown notifications.
- Processes post-sprint roll-overs and sends sprint summary/congratulations emails.
- Can run continuously as a daemon or single-shot (--once) for cron jobs.
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import sys
import time

# Ensure project root is in sys.path so 'backend.main' can always be imported
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.main import (
    db,
    execute,
    setup_database,
    year_progress,
    sprint_end_datetime,
    ensure_sprint_rollover,
    send_email_via_brevo,
    log_sent_reminder,
    EMAIL_LOGO_URL,
    FRONTEND_URL,
    IST,
)


def check_and_send_sprint_reminders(
    dry_run: bool = False,
    user_id: int | None = None,
    limit: int | None = None,
) -> dict:
    """Evaluate active sprints, pending goals, and send automated 12h/6h countdown and rollover wrap-up emails.
    
    Args:
        dry_run: If True, simulate email sends without making external Brevo HTTP requests.
        user_id: Optionally restrict processing to a single user ID.
        limit: Optionally cap the number of users evaluated.

    Returns a dictionary summarizing actions performed.
    """
    now = datetime.now(IST)
    progress = year_progress(now)
    current_year = progress["year"]
    current_sprint = progress["sprint_number"]
    
    sprint_end = sprint_end_datetime(current_year, current_sprint)
    hours_left = (sprint_end - now).total_seconds() / 3600.0
    logo_url = EMAIL_LOGO_URL if EMAIL_LOGO_URL else f"{FRONTEND_URL}/favicon.ico"
    
    reminder_type = None
    if 0 < hours_left <= 6.0:
        reminder_type = "6h"
    elif 6.0 < hours_left <= 12.0:
        reminder_type = "12h"
        
    stats = {
        "timestamp": now.isoformat(),
        "sprint_year": current_year,
        "sprint_number": current_sprint,
        "hours_left": round(hours_left, 2),
        "reminder_type": reminder_type,
        "dry_run": dry_run,
        "users_checked": 0,
        "reminders_sent": 0,
        "rollovers_processed": 0,
        "wrapups_sent": 0,
    }

    def _send(email: str, subj: str, body: str) -> bool:
        if dry_run:
            print(f"[Scheduler - Dry Run] Simulated email to {email}: {subj}")
            return True
        return send_email_via_brevo(email, subj, body)

    with db() as conn:
        if user_id is not None:
            users_rows = execute(conn, "SELECT id, email, display_name, name FROM users WHERE id = %s", (user_id,)).fetchall()
        elif limit is not None:
            users_rows = execute(conn, f"SELECT id, email, display_name, name FROM users LIMIT {int(limit)}").fetchall()
        else:
            users_rows = execute(conn, "SELECT id, email, display_name, name FROM users").fetchall()
        stats["users_checked"] = len(users_rows)
        
        # 1. 12h / 6h active reminders
        if reminder_type:
            for u_row in users_rows:
                u_id = u_row["id"]
                user_email = u_row["email"]
                user_name = u_row["display_name"] or u_row["name"] or "User"
                
                reminder_sent = execute(
                    conn,
                    "SELECT id FROM sprint_email_reminders WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s AND reminder_type = %s",
                    (u_id, current_year, current_sprint, reminder_type)
                ).fetchone()
                
                if reminder_sent:
                    continue
                    
                goals_rows = execute(
                    conn,
                    "SELECT title, target, progress FROM goals WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s AND completed = 0",
                    (u_id, current_year, current_sprint)
                ).fetchall()
                
                if not goals_rows:
                    continue
                    
                goals_list_html = "".join([
                    f"<li style='margin-bottom: 12px; font-size: 15px; color: #eef0e9; list-style: none; display: flex; align-items: center;'><span style='color: #c9f36a; margin-right: 10px;'>▪</span> <span><strong>{row['title']}</strong> (Progress: {row['progress']}/{row['target']})</span></li>"
                    for row in goals_rows
                ])
                
                subject = f"{int(round(hours_left))} Hours Left! Complete your Sprint #{current_sprint} Goals"
                html_body = f"""
                <div style="font-family: 'DM Sans', sans-serif; background: #141513; color: #f3f1ed; padding: 40px 24px; max-width: 580px; margin: 0 auto; border: 1px solid #2b2c28; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
                    <div style="text-align: center; margin-bottom: 36px;">
                        <img src="{logo_url}" alt="OnePercentGoal Logo" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block;" />
                        <div style="font-family: 'DM Mono', monospace; font-size: 10px; color: #8e9088; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500;">ONEPERCENTGOAL</div>
                    </div>
                    <p style="font-family: 'DM Mono', monospace; font-size: 11px; color: #c9f36a; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; font-weight: 500;">SPRINT COUNTDOWN ALERT</p>
                    <h1 style="font-size: 26px; font-weight: 600; color: #f6f5f1; letter-spacing: -0.04em; line-height: 1.25; margin: 0 0 20px;">
                        Hi {user_name}, you have {round(hours_left, 1)} hours left!
                    </h1>
                    <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 24px;">
                        Sprint #{current_sprint} of {current_year} is wrapping up. Don't let your compounding momentum slip. Here are the goals still requiring your attention:
                    </p>
                    <div style="background: #1c1d1a; border: 1px solid #2b2c28; border-radius: 8px; padding: 20px 20px 8px; margin-bottom: 28px;">
                        <ul style="padding-left: 0; list-style-type: none; margin: 0;">
                            {goals_list_html}
                        </ul>
                    </div>
                    <div style="text-align: center;">
                        <a href="{FRONTEND_URL}" style="display: inline-block; background: #c9f36a; color: #121411; text-decoration: none; padding: 12px 28px; border-radius: 99px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 15px rgba(201, 243, 106, 0.2);">
                            Open Sprint Dashboard
                        </a>
                    </div>
                    <div style="border-top: 1px solid #2f322b; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #8c9085; font-family: 'DM Mono', monospace; text-align: center;">
                        1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS
                    </div>
                </div>
                """
                
                success = _send(user_email, subject, html_body)
                if success:
                    log_sent_reminder(conn, u_id, current_year, current_sprint, reminder_type)
                    stats["reminders_sent"] += 1

        # 2. Post-Sprint Outcomes check
        if current_sprint > 1:
            prev_sprint = current_sprint - 1
            prev_year = current_year
        else:
            prev_sprint = 100
            prev_year = current_year - 1

        for u_row in users_rows:
            u_id = u_row["id"]
            user_email = u_row["email"]
            user_name = u_row["display_name"] or u_row["name"] or "User"

            try:
                ensure_sprint_rollover(conn, current_year, current_sprint, u_id)
                stats["rollovers_processed"] += 1
            except Exception as e:
                print(f"[Scheduler] Error running rollover for user {u_id}: {e}")

            wrap_sent = execute(
                conn,
                """
                SELECT id FROM sprint_email_reminders 
                WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s 
                  AND reminder_type IN ('sprint_end_congrats', 'sprint_end_rollover', 'sprint_end_skipped')
                """,
                (u_id, prev_year, prev_sprint)
            ).fetchone()

            if wrap_sent:
                continue

            prev_goals = execute(
                conn,
                "SELECT title, completed FROM goals WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s",
                (u_id, prev_year, prev_sprint)
            ).fetchall()

            if not prev_goals:
                log_sent_reminder(conn, u_id, prev_year, prev_sprint, "sprint_end_skipped")
                continue

            total_count = len(prev_goals)
            completed_count = sum(1 for g in prev_goals if g["completed"])

            if completed_count == total_count:
                subject = f"100% Completion! Congratulations on Sprint #{prev_sprint}!"
                html_body = f"""
                <div style="font-family: 'DM Sans', sans-serif; background: #141513; color: #f3f1ed; padding: 40px 24px; max-width: 580px; margin: 0 auto; border: 1px solid #2b2c28; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
                    <div style="text-align: center; margin-bottom: 36px;">
                        <img src="{logo_url}" alt="OnePercentGoal Logo" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block;" />
                        <div style="font-family: 'DM Mono', monospace; font-size: 10px; color: #8e9088; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500;">ONEPERCENTGOAL</div>
                    </div>
                    <p style="font-family: 'DM Mono', monospace; font-size: 11px; color: #c9f36a; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; font-weight: 500;">SPRINT END REPORT</p>
                    <h1 style="font-size: 32px; font-weight: 600; color: #c9f36a; letter-spacing: -0.05em; margin: 0 0 20px; font-family: 'Instrument Serif', serif; font-style: italic;">
                        Flawless Sprint! 100% Complete.
                    </h1>
                    <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 20px;">
                        Hi {user_name}, congratulations! You completed all <strong>{total_count}</strong> of your goals in Sprint #{prev_sprint} of {prev_year}.
                    </p>
                    <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 28px;">
                        This is a huge milestone for your compounding momentum. Staying consistent leads to a massive 37.78x yield by the end of the year. Let's keep the fire burning!
                    </p>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{FRONTEND_URL}" style="display: inline-block; background: #c9f36a; color: #121411; text-decoration: none; padding: 12px 28px; border-radius: 99px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 15px rgba(201, 243, 106, 0.2);">
                            Define Sprint #{current_sprint} Directives
                        </a>
                    </div>
                    <div style="border-top: 1px solid #2f322b; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #8c9085; font-family: 'DM Mono', monospace; text-align: center;">
                        1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS
                    </div>
                </div>
                """
                success = _send(user_email, subject, html_body)
                if success:
                    log_sent_reminder(conn, u_id, prev_year, prev_sprint, "sprint_end_congrats")
                    stats["wrapups_sent"] += 1

            else:
                rolled_goals = execute(
                    conn,
                    """
                    SELECT title, target, progress FROM goals 
                    WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s 
                      AND rolled_from_goal_id IS NOT NULL
                    """,
                    (u_id, current_year, current_sprint)
                ).fetchall()

                if rolled_goals:
                    rolled_list_html = "".join([
                        f"<li style='margin-bottom: 12px; font-size: 15px; color: #eef0e9; list-style: none; display: flex; align-items: center;'><span style='color: #c9f36a; margin-right: 10px;'>▪</span> <span><strong>{row['title']}</strong> (Progress: {row['progress']}/{row['target']})</li>"
                        for row in rolled_goals
                    ])
                    subject = f"Rollover Agenda: Sprint #{prev_sprint} Wrap-up & New Targets"
                    html_body = f"""
                    <div style="font-family: 'DM Sans', sans-serif; background: #141513; color: #f3f1ed; padding: 40px 24px; max-width: 580px; margin: 0 auto; border: 1px solid #2b2c28; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
                        <div style="text-align: center; margin-bottom: 36px;">
                            <img src="{logo_url}" alt="OnePercentGoal Logo" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block;" />
                            <div style="font-family: 'DM Mono', monospace; font-size: 10px; color: #8e9088; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500;">ONEPERCENTGOAL</div>
                        </div>
                        <p style="font-family: 'DM Mono', monospace; font-size: 11px; color: #c9f36a; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; font-weight: 500;">SPRINT WRAP-UP AGENDA</p>
                        <h1 style="font-size: 26px; font-weight: 600; color: #f6f5f1; letter-spacing: -0.04em; line-height: 1.25; margin: 0 0 20px;">
                            Sprint #{prev_sprint} Wrapped: Goals Rolled Over
                        </h1>
                        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 20px;">
                            Hi {user_name}, Sprint #{prev_sprint} has officially ended. You successfully finished <strong>{completed_count} of {total_count}</strong> goals.
                        </p>
                        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 20px;">
                            To keep your momentum, your remaining incomplete goals have been automatically transferred to your active <strong>Sprint #{current_sprint}</strong>:
                        </p>
                        <div style="background: #1c1d1a; border: 1px solid #2b2c28; border-radius: 8px; padding: 20px 20px 8px; margin-bottom: 28px;">
                            <ul style="padding-left: 0; list-style-type: none; margin: 0;">
                                {rolled_list_html}
                            </ul>
                        </div>
                        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin-bottom: 28px;">
                            Let's start fresh and check these off early in the next 3.6 days. Keep compounding every single cycle!
                        </p>
                        <div style="text-align: center;">
                            <a href="{FRONTEND_URL}" style="display: inline-block; background: #c9f36a; color: #121411; text-decoration: none; padding: 12px 28px; border-radius: 99px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 15px rgba(201, 243, 106, 0.2);">
                                Open Sprint Board
                            </a>
                        </div>
                        <div style="border-top: 1px solid #2f322b; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #8c9085; font-family: 'DM Mono', monospace; text-align: center;">
                            1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS
                        </div>
                    </div>
                    """
                    success = _send(user_email, subject, html_body)
                    if success:
                        log_sent_reminder(conn, u_id, prev_year, prev_sprint, "sprint_end_rollover")
                        stats["wrapups_sent"] += 1
                else:
                    log_sent_reminder(conn, u_id, prev_year, prev_sprint, "sprint_end_skipped")

    return stats


def run_email_scheduler_loop(
    interval: int = 300,
    dry_run: bool = False,
    user_id: int | None = None,
    limit: int | None = None,
):
    """Background daemon loop: executes email notification checks periodically."""
    mode_str = " [DRY RUN]" if dry_run else ""
    print(f"[Scheduler] Email reminder background loop started{mode_str} (interval: {interval}s).")
    try:
        while True:
            try:
                stats = check_and_send_sprint_reminders(dry_run=dry_run, user_id=user_id, limit=limit)
                print(f"[Scheduler] Pass finished at {stats['timestamp']}: {stats}")
            except Exception as e:
                print(f"[Scheduler] Error during execution pass: {e}")
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[Scheduler] Email reminder worker stopped.")


def main():
    """CLI entrypoint for standalone scheduler."""
    parser = argparse.ArgumentParser(description="OnePercentGoal Email Scheduler & Sprint Notification Worker")
    parser.add_argument("--once", action="store_true", help="Run a single evaluation pass and exit")
    parser.add_argument("--interval", type=int, default=300, help="Interval in seconds between runs (default: 300)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate email dispatch without calling Brevo API")
    parser.add_argument("--user-id", type=int, default=None, help="Restrict checks to a single user ID")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of users processed")
    args = parser.parse_args()

    # Ensure schema is up to date before operating
    setup_database()

    if args.once:
        print(f"[Scheduler] Running single notification pass (--once{' --dry-run' if args.dry_run else ''})...")
        stats = check_and_send_sprint_reminders(dry_run=args.dry_run, user_id=args.user_id, limit=args.limit)
        print(f"[Scheduler] Single pass complete: {stats}")
    else:
        run_email_scheduler_loop(interval=args.interval, dry_run=args.dry_run, user_id=args.user_id, limit=args.limit)


if __name__ == "__main__":
    main()

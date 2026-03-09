import { randomUUID } from 'node:crypto';
import { SqliteStore } from '../storage/sqliteStore.js';
import type { ReminderItem, ReminderMode } from '../types/domain.js';

interface ReminderScheduleInput {
  task_name: string;
  message: string;
  mode: ReminderMode;
  delay_minutes?: number;
  interval_minutes?: number;
}

export class ReminderService {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: SqliteStore,
    private readonly onReminderFired: (reminder: ReminderItem) => Promise<void>,
  ) {}

  async bootstrap(): Promise<void> {
    const reminders = this.store.listReminders().filter((r) => r.status === 'pending');
    for (const reminder of reminders) {
      this.scheduleTimer(reminder);
    }
  }

  listReminders(): ReminderItem[] {
    return this.store.listReminders();
  }

  async scheduleReminder(input: ReminderScheduleInput): Promise<ReminderItem> {
    const now = new Date();
    const delayMinutes = Math.max(0, Number(input.delay_minutes ?? input.interval_minutes ?? 30));
    const fireAt = new Date(now.getTime() + delayMinutes * 60 * 1000).toISOString();

    const reminder: ReminderItem = {
      id: randomUUID().replaceAll('-', ''),
      task_name: input.task_name || 'Reminder',
      message: input.message || 'Time to take a break.',
      mode: input.mode,
      fire_at: fireAt,
      interval_minutes: input.mode === 'repeat'
        ? Math.max(1, Number(input.interval_minutes ?? delayMinutes ?? 30))
        : undefined,
      status: 'pending',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    await this.store.upsertReminder(reminder);
    this.scheduleTimer(reminder);
    return reminder;
  }

  async cancelReminder(id: string): Promise<boolean> {
    const target = this.store.listReminders().find((r) => r.id === id);
    if (!target) {
      return false;
    }

    const cancelled: ReminderItem = {
      ...target,
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    };
    await this.store.upsertReminder(cancelled);
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    return true;
  }

  private scheduleTimer(reminder: ReminderItem): void {
    const prev = this.timers.get(reminder.id);
    if (prev) {
      clearTimeout(prev);
    }

    const delay = Math.max(1, new Date(reminder.fire_at).getTime() - Date.now());
    const timer = setTimeout(() => {
      void this.handleFire(reminder.id);
    }, delay);
    this.timers.set(reminder.id, timer);
  }

  private async handleFire(id: string): Promise<void> {
    this.timers.delete(id);
    const reminder = this.store.listReminders().find((r) => r.id === id);
    if (!reminder || reminder.status !== 'pending') {
      return;
    }

    await this.onReminderFired(reminder);

    if (reminder.mode === 'repeat' && reminder.interval_minutes) {
      const nextFireAt = new Date(Date.now() + reminder.interval_minutes * 60 * 1000).toISOString();
      const nextReminder: ReminderItem = {
        ...reminder,
        fire_at: nextFireAt,
        updated_at: new Date().toISOString(),
      };
      await this.store.upsertReminder(nextReminder);
      this.scheduleTimer(nextReminder);
      return;
    }

    const done: ReminderItem = {
      ...reminder,
      status: 'fired',
      updated_at: new Date().toISOString(),
    };
    await this.store.upsertReminder(done);
  }
}

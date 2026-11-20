/**
 * Phase 3 step 4 (v0.16.0) — chat OWNED by Azure SQL when CHAT_OWNER=azure.
 *
 * getChatMessages / postChatMessage answer exactly like Code.gs (same message shape, limits, display name and class name
 * — the last two from the copied Code.gs functions chatDisplayName_ / findClassNamesForViewer_), but the messages live in
 * dbo.chat_message instead of the Dashboard_Chat_Window sheet. Apps Script's chat reads and posts through the reverse
 * bridge (AzureBridge.gs r136), so both dashboards show one conversation.
 *
 *  - Chat version (what makes open pages reload the chat): "v<newest id>.<oldest id>", refreshed every 10 s (covers posts
 *    made through the other dashboard or another instance) and at once after a post here.
 *  - A post made here tells Apps Script (forward bridge action "chatChanged") so its cache / version change at once.
 *  - Messages older than 10 days are deleted hourly (CHAT_RETENTION_DAYS); the newest 200 are shown (CHAT_HISTORY_LIMIT).
 *  - First start with CHAT_OWNER=azure: the last 10 days of the sheet are copied in once (only when the table is empty).
 */
import type { AppContext } from '../app/context';
import type { WorkbookKey } from '../data/types';
import { gasRun } from '../api/endpoints/classes';
import type { ChatRow, ChatStore } from './chatStore';
import { describeDbError } from './sheetStore';

/** Code.gs constants (test/chat.test.ts checks them against Code.gs). */
export const CHAT_SHEET_NAME = 'Dashboard_Chat_Window';
export const CHAT_MAX_MESSAGE_LENGTH = 2000;
export const CHAT_HISTORY_LIMIT = 200;
export const CHAT_RETENTION_DAYS = 10;
export const CHAT_OWNED_FNS = ['getChatMessages', 'postChatMessage'];
export const CHAT_NOT_READY_MSG = 'The chat is not available right now. Please try again in a minute.';

export interface ChatMessage { timestamp: string; email: string; role: string; name: string; message: string; className: string }

export class ChatOwner {
  ready = false;
  private ver = '';
  private timers: NodeJS.Timeout[] = [];
  constructor(private store: ChatStore, private notify: () => Promise<void> = async () => {},
    private now: () => number = Date.now, private log: (m: string) => void = console.log) {}

  version(): string { return this.ver; }
  private cutoff(): number { return this.now() - CHAT_RETENTION_DAYS * 86_400_000; }

  async refreshVersion(): Promise<string> {
    const s = await this.store.stamp(this.cutoff());
    this.ver = 'v' + s.maxId + '.' + s.minId;
    return this.ver;
  }

  async list(): Promise<ChatMessage[]> {
    if (!this.ready) throw new Error(CHAT_NOT_READY_MSG);
    const rows = await this.store.list(this.cutoff(), CHAT_HISTORY_LIMIT);
    return rows.filter((r) => r.message).map(toMessage);
  }

  /** The message is stored only after the caller has checked the session and worked out name / class name. */
  async add(row: Omit<ChatRow, 'createdAt' | 'id'>): Promise<void> {
    if (!this.ready) throw new Error(CHAT_NOT_READY_MSG);
    await this.store.add({ ...row, createdAt: this.now() });
    await this.refreshVersion().catch(() => undefined);
    this.notify().catch(() => undefined);
  }

  /** First start: copy the sheet's last 10 days in, once (only when the table is empty). Then the table is the owner. */
  async start(readSheet: () => Promise<unknown[][] | null>, everyMs = 10_000): Promise<boolean> {
    try {
      if ((await this.store.total()) === 0) {
        const grid = (await readSheet()) || [];
        const cut = this.cutoff(), rows: ChatRow[] = [];
        for (const r of grid.slice(1)) {
          const t = r[0] instanceof Date ? (r[0] as Date).getTime() : Date.parse(String(r[0] || ''));
          if (!Number.isFinite(t) || t <= cut || !String(r[4] || '').trim()) continue;
          rows.push({ createdAt: t, email: String(r[1] || ''), role: String(r[2] || ''), name: String(r[3] || ''), message: String(r[4]).slice(0, CHAT_MAX_MESSAGE_LENGTH), className: String(r[5] || '') });
        }
        rows.sort((a, b) => a.createdAt - b.createdAt);
        if (rows.length) await this.store.addMany(rows);
        this.log('[Chat] chat is now OWNED by Azure SQL (CHAT_OWNER=azure) — ' + rows.length + ' message(s) of the last ' + CHAT_RETENTION_DAYS + ' days copied from ' + CHAT_SHEET_NAME + '.');
      } else this.log('[Chat] chat is OWNED by Azure SQL (CHAT_OWNER=azure).');
      await this.refreshVersion();
      this.ready = true;
    } catch (e) { this.log('[Chat] CHAT_OWNER=azure: the chat table could not be prepared: ' + describeDbError(e) + ' — the chat shows "not available" until fixed.'); return false; }
    const tick = setInterval(() => { this.refreshVersion().catch(() => undefined); }, everyMs); tick.unref?.();
    const prune = setInterval(() => { this.store.prune(this.cutoff()).then(() => this.refreshVersion()).catch(() => undefined); }, 3_600_000); prune.unref?.();
    this.timers.push(tick, prune);
    return true;
  }
  stop(): void { for (const t of this.timers) clearInterval(t); this.timers = []; }
}

function toMessage(r: ChatRow): ChatMessage {
  return { timestamp: new Date(r.createdAt).toISOString(), email: r.email, role: r.role, name: r.name, message: r.message, className: r.className };
}

/** getChatMessages for a verified session (Code.gs: role 'none' → []). */
export async function ownedChatList(ctx: AppContext, session: { email: string; role: string }): Promise<ChatMessage[]> {
  if (!ctx.chat) throw new Error(CHAT_NOT_READY_MSG);
  if (session.role === 'none') return [];
  return ctx.chat.list();
}

/** postChatMessage for a verified session — same checks, limits and messages as Code.gs; returns the fresh list. */
export async function ownedChatPost(ctx: AppContext, session: { email: string; role: string }, text: unknown): Promise<ChatMessage[]> {
  let message = String(text === null || text === undefined ? '' : text).trim();
  if (!message) throw new Error('Message is empty.');
  if (message.length > CHAT_MAX_MESSAGE_LENGTH) message = message.slice(0, CHAT_MAX_MESSAGE_LENGTH);
  if (!ctx.chat) throw new Error(CHAT_NOT_READY_MSG);
  const viewer = { email: session.email, role: session.role };
  if (viewer.role === 'none') throw new Error('Only a recognized admin, headmaster, teacher, or student can post in the chat.');
  const all = await ctx.data.readCourses(); // = readAllCoursesFromCache_ in the copied code
  const who = await gasRun(ctx, session, (S) => {
    const courses = JSON.parse(JSON.stringify(all));
    return { name: String(S.chatDisplayName_(viewer, courses) || ''), className: String(S.findClassNamesForViewer_(courses, viewer) || '') };
  });
  await ctx.chat.add({ email: viewer.email, role: viewer.role, name: who.name, message, className: who.className });
  return ctx.chat.list();
}

/** The sheet as it is now (import on the first start). */
export async function readChatSheet(ctx: AppContext): Promise<unknown[][] | null> {
  const snap = await ctx.data.readSheets('main' as WorkbookKey, [CHAT_SHEET_NAME]);
  const g = snap.sheets[CHAT_SHEET_NAME];
  return g ? g.values : null;
}

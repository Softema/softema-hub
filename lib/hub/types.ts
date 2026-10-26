/**
 * Frontend domain model of Softema Hub (mirrors docs/ZADANI-APLIKACE.md, kap. 5).
 * Every tenant record carries `workspaceId`; the in-browser store keeps all workspaces
 * side by side and the UI always reads through a workspace filter.
 * Dates are ISO strings (UTC); the UI formats them in Europe/Prague.
 */

export type ISODate = string;

/* ---------- Workspace, team, settings ---------- */
export type Role = 'agency_admin' | 'workspace_admin' | 'member';
export interface TeamMember { id: string; name: string; email: string; role: Role; status: 'Aktivní' | 'Pozvánka odeslána'; color: string }
export interface DnsRecord { type: 'TXT' | 'CNAME' | 'MX'; host: string; value: string; purpose: 'SPF' | 'DKIM' | 'DMARC' | 'Return-Path'; verified: boolean }
export interface SendingDomain { id: string; domain: string; status: 'Ověřeno' | 'Čeká na DNS' | 'Chyba'; records: DnsRecord[]; addedAt: ISODate }
export interface Sender { id: string; name: string; email: string; isDefault: boolean }
export type IntegrationKey = 'resend' | 'stripe' | 'fakturoid' | 'mux' | 'livekit' | 'n8n' | 'claude';
/** Only non-secret configuration lives in the browser; API keys are entered on the server once a backend exists. */
export interface IntegrationState { connected: boolean; account?: string; options: Record<string, string | boolean> }
export interface NotificationPrefs { payments: boolean; newContacts: boolean; campaigns: boolean; community: boolean; webinars: boolean; dailyDigest: boolean }
export interface WorkspaceSettings {
  id: string; workspaceId: string;
  name: string; kind: 'Interní prostor agentury' | 'Klientský prostor';
  brandColor: string; logo?: StoredImage;
  company: { legalName: string; ico: string; dic: string; vatPayer: boolean; address: string; email: string };
  timezone: string; currency: 'CZK';
  team: TeamMember[];
  domains: SendingDomain[]; senders: Sender[];
  integrations: Record<IntegrationKey, IntegrationState>;
  notifications: NotificationPrefs;
  portal: { title: string; color: string; customDomain: string; magicLink: boolean };
  community: { gracePeriodDays: number };
  invoicing: { prefix: string; dueDays: number; nextNumber: number };
}
export interface UserProfile { name: string; email: string; phone: string; title: string; color: string; twoFactor: boolean; photo?: StoredImage }

/** Small images are stored as data URLs in the browser; anything else keeps only metadata. */
export interface StoredImage { name: string; dataUrl: string; size: number }
export interface FileMeta { id: string; name: string; size: number; type: string; addedAt: ISODate }

/* ---------- CRM ---------- */
export type Lifecycle = 'Lead' | 'Zájemce' | 'Klient';
export type ConsentState = 'Udělen' | 'Čeká na potvrzení' | 'Odvolán' | 'Bez souhlasu';
export interface ConsentEvent { date: ISODate; state: ConsentState; source: string }
export interface Consent { state: ConsentState; source: string; date: ISODate; ip: string; doubleOptIn: boolean; history: ConsentEvent[] }
export interface Note { id: string; text: string; author: string; date: ISODate }
export interface CustomField { id: string; name: string; value: string }
export interface Contact {
  id: number; workspaceId: string;
  name: string; email: string; phone: string; company: string; city: string;
  tags: string[]; stage: Lifecycle; source: string; owner: string; color: string;
  createdAt: ISODate; notes: Note[]; customFields: CustomField[]; consent: Consent;
}
export type SegmentField = 'tag' | 'stage' | 'source' | 'consent' | 'city' | 'company' | 'createdDays' | 'customField' | 'course' | 'webinar';
export interface SegmentRule { id: string; field: SegmentField; op: 'is' | 'isNot' | 'contains' | 'lessThan'; value: string; key?: string }
export interface Segment { id: string; workspaceId: string; name: string; description: string; match: 'all' | 'any'; rules: SegmentRule[]; createdAt: ISODate }
export const DEAL_STAGES = ['Nový lead', 'Kvalifikace', 'Nabídka odeslána', 'Vyjednávání', 'Vyhráno', 'Prohráno'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export interface Deal { id: string; workspaceId: string; contactId: number; title: string; value: number; stage: DealStage; probability: number; updatedAt: ISODate; createdAt: ISODate }
export type ActivityType = 'contact' | 'note' | 'tag' | 'stage' | 'deal' | 'consent' | 'email_sent' | 'email_open' | 'email_click' | 'email_bounce' | 'invoice' | 'payment' | 'refund' | 'subscription' | 'course' | 'lesson' | 'product' | 'community' | 'webinar' | 'chatbot' | 'automation' | 'form';
export interface Activity { id: string; workspaceId: string; contactId: number; type: ActivityType; title: string; detail: string; date: ISODate; route?: string }

/* ---------- E-mailing ---------- */
export type BlockAlign = 'left' | 'center' | 'right';
export interface Block { id: string; type: string; text: string; color?: string; url?: string; align?: BlockAlign }
export type CampaignStatus = 'Koncept' | 'Naplánováno' | 'Odesláno';
/** all = every contact of the workspace; segment = live segment; manual = only `extraContactIds` (e.g. contacts picked in the CRM list). */
export type Audience = { type: 'all' } | { type: 'segment'; segmentId: string } | { type: 'manual' };
export interface RecipientResult { contactId: number; delivered: boolean; opened: boolean; clicked: boolean; unsubscribed: boolean; link?: string }
export interface Campaign {
  id: number; workspaceId: string;
  name: string; subject: string; preheader: string; sender: string; senderEmail: string;
  status: CampaignStatus; audience: Audience; extraContactIds: number[];
  editor: 'unlayer' | 'blocks'; blocks: Block[]; design?: unknown; html?: string;
  createdAt: ISODate; updatedAt: ISODate; scheduledAt?: ISODate; sentAt?: ISODate;
  /** snapshot of the audience at send time (simulated delivery) */
  results?: RecipientResult[];
  links: string[];
}

/* ---------- Automations ---------- */
export type FlowNodeKind = 'trigger' | 'email' | 'wait' | 'condition' | 'tag' | 'untag' | 'stage' | 'campaign' | 'webhook' | 'notify' | 'end';
export interface FlowNodeData { kind: FlowNodeKind; title: string; config: Record<string, string> }
export interface FlowNode { id: string; position: { x: number; y: number }; data: FlowNodeData }
export interface FlowEdge { id: string; source: string; target: string; sourceHandle?: 'yes' | 'no' | null }
export interface Workflow {
  id: string; workspaceId: string; name: string; description: string;
  status: 'Aktivní' | 'Pozastaveno' | 'Koncept';
  nodes: FlowNode[]; edges: FlowEdge[];
  enrolled: { contactId: number; nodeId: string; since: ISODate }[];
  completed: number; updatedAt: ISODate;
}

/* ---------- Payments ---------- */
export interface InvoiceItem { id: string; name: string; qty: number; price: number }
export type InvoiceStatus = 'Koncept' | 'Odeslaná' | 'Zaplacená' | 'Stornovaná';
export interface Invoice { id: string; workspaceId: string; number: string; contactId: number; items: InvoiceItem[]; status: InvoiceStatus; issuedAt: ISODate; dueAt: ISODate; paidAt?: ISODate; note: string }
export interface Transaction { id: string; workspaceId: string; contactId: number; amount: number; status: 'Úspěšná' | 'Neúspěšná' | 'Vrácená'; method: 'Karta' | 'Bankovní převod' | 'Platební odkaz'; date: ISODate; description: string; invoiceId?: string }
export interface Subscription { id: string; workspaceId: string; contactId: number; plan: string; price: number; interval: 'měsíčně' | 'ročně'; status: 'Aktivní' | 'Pozastaveno' | 'Zrušeno'; startedAt: ISODate; nextPaymentAt: ISODate }
export interface PaymentLink { id: string; workspaceId: string; name: string; amount: number; kind: 'Jednorázová' | 'Předplatné'; active: boolean; opened: number; paid: number; slug: string; createdAt: ISODate }
export interface Coupon { id: string; workspaceId: string; code: string; kind: 'percent' | 'fixed'; value: number; limit: number; used: number; expiresAt: ISODate; active: boolean }

/* ---------- Courses, digital products ---------- */
export type LessonType = 'Video' | 'Text' | 'Soubor' | 'Kvíz';
/** `text` stays as plain text (quiz source, search); `content` is the formatted lesson text when present. */
export interface Lesson { id: string; title: string; type: LessonType; duration: number; videoUrl: string; text: string; content?: RichNode; attachments: FileMeta[]; dripDays: number; preview: boolean }
export interface CourseModule { id: string; title: string; lessons: Lesson[] }
export type PriceType = 'Zdarma' | 'Jednorázově' | 'Předplatné' | 'Součást členství';
export interface Course {
  id: string; workspaceId: string; title: string; subtitle: string; description: string;
  image?: StoredImage; accent: string; price: number; priceType: PriceType;
  status: 'Koncept' | 'Publikováno'; drip: 'Vše hned' | 'Postupně'; certificate: boolean;
  modules: CourseModule[]; createdAt: ISODate; updatedAt: ISODate;
}
export interface Enrollment { id: string; workspaceId: string; courseId: string; contactId: number; enrolledAt: ISODate; completedLessonIds: string[]; status: 'Aktivní' | 'Dokončeno' | 'Pozastaveno'; lastActivityAt: ISODate }
export interface DigitalProduct { id: string; workspaceId: string; title: string; description: string; kind: 'E-book' | 'Šablona' | 'Audio' | 'Video' | 'Balíček'; price: number; status: 'Koncept' | 'Publikováno'; files: FileMeta[]; image?: StoredImage; createdAt: ISODate }
export interface Purchase { id: string; workspaceId: string; productId: string; contactId: number; date: ISODate; downloads: number }

/* ---------- Community ---------- */
export type GroupAccess = 'Veřejná' | 'Placená' | 'Součást kurzu' | 'Na pozvání';
export interface CommunityGroup { id: string; workspaceId: string; name: string; description: string; access: GroupAccess; price: number; courseId?: string; accent: string; categories: ForumCategory[]; createdAt: ISODate }
/** Forum category inside a group; every post belongs to one. A group always keeps at least one. */
export interface ForumCategory { id: string; name: string; description: string }
export interface Membership { id: string; workspaceId: string; groupId: string; contactId: number; role: 'Člen' | 'Moderátor'; status: 'Aktivní' | 'Zablokován' | 'Vypršelo'; joinedAt: ISODate }
/** Rich text from the community editor (Tiptap JSON). Rendered through a whitelist, never as raw HTML. */
export interface RichNode { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: RichNode[] }
/** Images keep a small data URL (browser only); other files keep only metadata. */
export interface Attachment { id: string; name: string; size: number; type: string; dataUrl?: string }
/** `text` is the plain-text version (moderation, activity, search); `content` the formatted one when present. */
export interface Comment { id: string; author: string; contactId?: number; text: string; content?: RichNode; attachments?: Attachment[]; date: ISODate; hidden: boolean }
export interface Report { id: string; reason: string; by: string; date: ISODate; resolved: boolean; commentId?: string }
export interface Post { id: string; workspaceId: string; groupId: string; author: string; contactId?: number; text: string; content?: RichNode; attachments?: Attachment[]; categoryId: string; date: ISODate; pinned: boolean; hidden: boolean; reactions: Partial<Record<Reaction, number>>; myReaction?: Reaction; comments: Comment[]; reports: Report[] }
/** Facebook-style reactions; `reactions` counts include the user's own `myReaction`. */
export type Reaction = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

/* ---------- Webinars ---------- */
export interface ReminderSettings { confirmation: boolean; before24h: boolean; before1h: boolean; followUp: boolean; replayMail: boolean }
export interface Webinar {
  id: string; workspaceId: string; title: string; description: string; image?: StoredImage; accent: string;
  kind: 'live' | 'evergreen'; startsAt: ISODate; timezone: string; durationMin: number; host: string;
  /** evergreen: daily start times "HH:MM" */
  sessions: string[];
  video: { source: 'LiveKit' | 'Mux' | 'YouTube' | 'Vimeo' | 'Jiný odkaz'; url: string };
  published: boolean; cancelled: boolean; slug: string;
  reminders: ReminderSettings; replayDays: number; tag: string; createdAt: ISODate;
}
export interface Registration { id: string; workspaceId: string; webinarId: string; contactId: number; registeredAt: ISODate; source: string; attended: boolean | null; watchMinutes: number; replay: boolean }

/* ---------- Chatbot ---------- */
export interface KnowledgeSource { id: string; kind: 'Webová stránka' | 'Dokument' | 'Otázky a odpovědi' | 'FAQ'; title: string; content: string; url?: string; file?: FileMeta; status: 'Natrénováno' | 'Zpracovává se' | 'Chyba'; updatedAt: ISODate }
export interface ChatbotConfig {
  id: string; workspaceId: string; name: string; color: string; avatar: string; welcome: string; placeholder: string;
  position: 'Vpravo dole' | 'Vlevo dole'; launcher: string; active: boolean;
  persona: string; tone: string; fallback: string; languages: string[];
  leadCapture: { enabled: boolean; askName: boolean; askEmail: boolean; askPhone: boolean; tag: string };
  handoff: { enabled: boolean; email: string };
  sources: KnowledgeSource[];
}

/* ---------- Store ---------- */
export interface HubData {
  contacts: Contact[]; segments: Segment[]; deals: Deal[]; activities: Activity[];
  campaigns: Campaign[]; workflows: Workflow[];
  invoices: Invoice[]; transactions: Transaction[]; subscriptions: Subscription[]; paymentLinks: PaymentLink[]; coupons: Coupon[];
  courses: Course[]; enrollments: Enrollment[]; products: DigitalProduct[]; purchases: Purchase[];
  groups: CommunityGroup[]; memberships: Membership[]; posts: Post[];
  webinars: Webinar[]; registrations: Registration[];
  chatbots: ChatbotConfig[]; settings: WorkspaceSettings[];
  profile: UserProfile;
}
export type CollectionKey = { [K in keyof HubData]: HubData[K] extends unknown[] ? K : never }[keyof HubData];
export type ItemOf<K extends CollectionKey> = HubData[K][number];

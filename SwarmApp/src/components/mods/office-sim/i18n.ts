/** Office Sim — Localization for in-scene text (KO/EN/JA/ZH) */

export type Locale = "en" | "ko" | "ja" | "zh";

interface LocaleStrings {
  queueInbox: string;
  idle: string;
  active: string;
  meetingRoom: string;
  breakRoom: string;
  errorBay: string;
  serverRoom: string;
  ceo: string;
  agents: string;
  errors: string;
  tasks: string;
  empty: string;
  ready: string;
  working: string;
  thinking: string;
  offline: string;
  blocked: string;
  spawning: string;
  people: (n: number) => string;
  taskCount: (n: number) => string;
  // Art
  customizeArt: string;
  generateArt: string;
  revertArt: string;
  artSlot: string;
  artGenerating: string;
  artClickToCustomize: string;
  // Character sprites
  designCharacter: string;
  spriteSheet: string;
  animatedSprite: string;
}

const EN: LocaleStrings = {
  queueInbox: "QUEUE / INBOX",
  idle: "idle",
  active: "active",
  meetingRoom: "Meeting Room",
  breakRoom: "Break Room",
  errorBay: "Error Bay",
  serverRoom: "Server Room",
  ceo: "CEO",
  agents: "agents",
  errors: "errors",
  tasks: "tasks",
  empty: "Empty",
  ready: "Ready",
  working: "Working",
  thinking: "Thinking",
  offline: "Offline",
  blocked: "Blocked",
  spawning: "Spawning",
  people: (n) => `${n} people`,
  taskCount: (n) => `${n} task${n !== 1 ? "s" : ""}`,
  customizeArt: "Customize Art",
  generateArt: "Generate Art",
  revertArt: "Revert to Default",
  artSlot: "Art Slot",
  artGenerating: "Generating...",
  artClickToCustomize: "Click to customize",
  designCharacter: "Design Character",
  spriteSheet: "Sprite Sheet",
  animatedSprite: "Animated Sprite",
};

const KO: LocaleStrings = {
  queueInbox: "대기열 / 수신함",
  idle: "대기 중",
  active: "활성",
  meetingRoom: "회의실",
  breakRoom: "휴게실",
  errorBay: "오류 구역",
  serverRoom: "서버실",
  ceo: "CEO",
  agents: "에이전트",
  errors: "오류",
  tasks: "작업",
  empty: "비어 있음",
  ready: "준비됨",
  working: "작업 중",
  thinking: "사고 중",
  offline: "오프라인",
  blocked: "차단됨",
  spawning: "생성 중",
  people: (n) => `${n}명`,
  taskCount: (n) => `${n}건`,
  customizeArt: "아트 커스터마이즈",
  generateArt: "아트 생성",
  revertArt: "기본값으로 되돌리기",
  artSlot: "아트 슬롯",
  artGenerating: "생성 중...",
  artClickToCustomize: "클릭하여 커스터마이즈",
  designCharacter: "캐릭터 디자인",
  spriteSheet: "스프라이트 시트",
  animatedSprite: "애니메이션 스프라이트",
};

const JA: LocaleStrings = {
  queueInbox: "キュー / 受信箱",
  idle: "待機中",
  active: "稼働中",
  meetingRoom: "会議室",
  breakRoom: "休憩室",
  errorBay: "エラー区域",
  serverRoom: "サーバー室",
  ceo: "CEO",
  agents: "エージェント",
  errors: "エラー",
  tasks: "タスク",
  empty: "空",
  ready: "準備完了",
  working: "作業中",
  thinking: "思考中",
  offline: "オフライン",
  blocked: "ブロック中",
  spawning: "生成中",
  people: (n) => `${n}人`,
  taskCount: (n) => `${n}件`,
  customizeArt: "アートカスタマイズ",
  generateArt: "アート生成",
  revertArt: "デフォルトに戻す",
  artSlot: "アートスロット",
  artGenerating: "生成中...",
  artClickToCustomize: "クリックしてカスタマイズ",
  designCharacter: "キャラクターデザイン",
  spriteSheet: "スプライトシート",
  animatedSprite: "アニメーションスプライト",
};

const ZH: LocaleStrings = {
  queueInbox: "队列 / 收件箱",
  idle: "空闲",
  active: "活跃",
  meetingRoom: "会议室",
  breakRoom: "休息室",
  errorBay: "错误区",
  serverRoom: "服务器室",
  ceo: "CEO",
  agents: "代理",
  errors: "错误",
  tasks: "任务",
  empty: "空",
  ready: "就绪",
  working: "工作中",
  thinking: "思考中",
  offline: "离线",
  blocked: "阻塞",
  spawning: "生成中",
  people: (n) => `${n}人`,
  taskCount: (n) => `${n}个任务`,
  customizeArt: "自定义艺术品",
  generateArt: "生成艺术品",
  revertArt: "恢复默认",
  artSlot: "艺术品位置",
  artGenerating: "生成中...",
  artClickToCustomize: "点击自定义",
  designCharacter: "角色设计",
  spriteSheet: "精灵图表",
  animatedSprite: "动画精灵",
};

const LOCALE_MAP: Record<Locale, LocaleStrings> = { en: EN, ko: KO, ja: JA, zh: ZH };

export function t(locale: Locale): LocaleStrings {
  return LOCALE_MAP[locale] || EN;
}

/** Detect locale from navigator.language */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("ko")) return "ko";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

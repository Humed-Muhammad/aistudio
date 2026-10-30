import {
  Activity, AlarmClock, ArrowRight, ArrowUpRight, AtSign, Award, Baby, Banknote, BadgeCheck, Bell, Bike, Bird, Bug, Cat, Dog, Fish, Rabbit, Rat, Shell, Snail, Squirrel, Turtle, Worm, Bolt, BookOpen, Bot, Brain, Briefcase, Building, Bus,
  Calculator, Calendar, CalendarCheck, Camera, Car, ChartColumn, Church, ChartLine, ChartPie, Check, ChevronRight, CircleAlert, CircleCheck, CircleX,
  ClipboardCheck, Clock, Cloud, Code, Coffee, Coins, Cpu, CreditCard, Crown, Database, DollarSign, Download, Droplet, Dumbbell, Ear, Eye, FileText,
  FingerprintPattern, Flame, Folder, Footprints, Gem, Gift, Globe, GraduationCap, Hammer, Hand, Handshake, Hash, Headphones, Heart, HeartPulse, Hourglass, House,
  Image, Inbox, Infinity as InfinityIcon, Key, Landmark, Languages, Laptop, Layers, LayoutDashboard, Leaf, Lightbulb, Link, ListChecks, Lock,
  Mail, Map, MapPin, Megaphone, MessageCircle, Mic, Monitor, Moon, Mosque, Motorbike, Music, Navigation, Package, Paintbrush, Palette, PawPrint, Pill, PenTool,
  Percent, PersonStanding, Phone, PiggyBank, Plane, Play, Plus, Puzzle, QrCode, Receipt, RefreshCw, Rocket, ScanLine, Scissors, Scooter, Search, Send, Settings, Share2,
  Shield, ShieldCheck, Shirt, ShoppingBag, ShoppingCart, ShowerHead, Smartphone, Sparkles, Sprout, Star, Stethoscope, Store, Sun, Sunrise, Tag, Target, Terminal,
  ThumbsUp, Ticket, Timer, TrendingDown, TrendingUp, Trophy, Truck, Upload, User, Users, Utensils, Video, VolumeX, Wallet, WandSparkles, Wifi, Workflow,
  Wrench, X, Zap, type LucideIcon,
} from "lucide-react";

// Icons scenes can draw by name (Lucide, ISC licence). Fields hold the name, e.g. "calendar-check".
// films.py reads this list (ICON_NAMES) to check plans; unknown names fall back to a dot.

const ICONS: Record<string, LucideIcon> = {
  activity: Activity, alarm: AlarmClock, "arrow-right": ArrowRight, "arrow-up-right": ArrowUpRight, at: AtSign, award: Award, baby: Baby, banknote: Banknote,
  badge: BadgeCheck, bell: Bell, bike: Bike, bolt: Bolt, book: BookOpen, bot: Bot, brain: Brain, briefcase: Briefcase, building: Building,
  bus: Bus, motorbike: Motorbike, scooter: Scooter, walk: Footprints, person: PersonStanding, mosque: Mosque, church: Church,
  shower: ShowerHead, sunrise: Sunrise, ear: Ear, mute: VolumeX, hand: Hand, calculator: Calculator, calendar: Calendar, "calendar-check": CalendarCheck, camera: Camera, car: Car, "chart-bar": ChartColumn,
  "chart-line": ChartLine, "chart-pie": ChartPie, check: Check, "chevron-right": ChevronRight, alert: CircleAlert, "check-circle": CircleCheck,
  "x-circle": CircleX, clipboard: ClipboardCheck, clock: Clock, cloud: Cloud, code: Code, coffee: Coffee, coins: Coins, cpu: Cpu,
  card: CreditCard, crown: Crown, database: Database, dollar: DollarSign, download: Download, droplet: Droplet, dumbbell: Dumbbell, eye: Eye,
  file: FileText, fingerprint: FingerprintPattern, flame: Flame, folder: Folder, gem: Gem, gift: Gift, globe: Globe, school: GraduationCap,
  hammer: Hammer, handshake: Handshake, hash: Hash, headphones: Headphones, heart: Heart, health: HeartPulse, hourglass: Hourglass, home: House,
  image: Image, inbox: Inbox, infinity: InfinityIcon, key: Key, bank: Landmark, languages: Languages, laptop: Laptop, layers: Layers,
  dashboard: LayoutDashboard, leaf: Leaf, idea: Lightbulb, link: Link, checklist: ListChecks, lock: Lock, mail: Mail, map: Map, pin: MapPin,
  megaphone: Megaphone, chat: MessageCircle, mic: Mic, monitor: Monitor, moon: Moon, music: Music, navigation: Navigation, package: Package,
  brush: Paintbrush, palette: Palette, paw: PawPrint, bug: Bug, snail: Snail, worm: Worm, turtle: Turtle, fish: Fish, bird: Bird, rabbit: Rabbit, squirrel: Squirrel,
  cat: Cat, dog: Dog, rat: Rat, shell: Shell, pill: Pill, pen: PenTool, percent: Percent, phone: Phone, piggy: PiggyBank, plane: Plane,
  play: Play, plus: Plus, puzzle: Puzzle, qr: QrCode, receipt: Receipt, refresh: RefreshCw, rocket: Rocket, scan: ScanLine, scissors: Scissors,
  search: Search, send: Send, settings: Settings, share: Share2, shield: Shield, "shield-check": ShieldCheck, shirt: Shirt, bag: ShoppingBag,
  cart: ShoppingCart, smartphone: Smartphone, sparkles: Sparkles, sprout: Sprout, star: Star, stethoscope: Stethoscope, store: Store, sun: Sun,
  tag: Tag, target: Target, terminal: Terminal, "thumbs-up": ThumbsUp, ticket: Ticket, timer: Timer, "trending-down": TrendingDown,
  "trending-up": TrendingUp, trophy: Trophy, truck: Truck, upload: Upload, user: User, users: Users, food: Utensils, video: Video,
  wallet: Wallet, magic: WandSparkles, wifi: Wifi, workflow: Workflow, wrench: Wrench, x: X, zap: Zap,
};

export const ICON_NAMES = Object.keys(ICONS);

/** One icon by name, drawn with a round stroke that scales with its size. */
export const Icon: React.FC<{ name: string; size: number; color: string; stroke?: number; style?: React.CSSProperties }> = ({ name, size, color, stroke = 2, style }) => {
  const Svg = ICONS[name.trim().toLowerCase()];
  if (!Svg)
    return <span style={{ display: "inline-block", width: size * 0.4, height: size * 0.4, margin: size * 0.3, borderRadius: "50%", background: color, ...style }} />;
  return <Svg size={size} color={color} strokeWidth={stroke} absoluteStrokeWidth={false} style={{ display: "block", flex: "none", ...style }} />;
};

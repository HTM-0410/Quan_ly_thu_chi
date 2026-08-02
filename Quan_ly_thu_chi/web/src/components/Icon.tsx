import { type ComponentType, type CSSProperties, type SVGProps } from 'react';
import {
  Activity,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Banknote,
  Briefcase,
  Building2,
  Bus,
  Car,
  Circle,
  CircleDot,
  Coffee,
  Coins,
  CreditCard,
  DollarSign,
  Dumbbell,
  Gamepad2,
  Gift,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Home,
  House,
  Landmark,
  Laptop,
  MoreHorizontal,
  Music,
  Package,
  PawPrint,
  Phone,
  PiggyBank,
  Plane,
  Plug,
  Receipt,
  RotateCcw,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Stethoscope,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  Tv,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideProps,
} from 'lucide-react';

/**
 * Registry mapping string IDs (persisted in DB / form state) to Lucide icons.
 * Includes aliases for Material Symbols naming (legacy DB seed values)
 * and Lucide-native names for future-proofing.
 */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  // --- Default ---
  category: Tag,
  tag: Tag,
  circle: Circle,

  // --- Food & dining ---
  restaurant: UtensilsCrossed,
  coffee: Coffee,
  utensils: UtensilsCrossed,

  // --- Transport ---
  directions_car: Car,
  car: Car,
  directions_bus: Bus,
  bus: Bus,
  flight: Plane,
  plane: Plane,

  // --- Shopping ---
  shopping_bag: ShoppingBag,
  shopping_cart: ShoppingCart,
  shoppingbag: ShoppingBag,

  // --- Home & bills ---
  home: Home,
  house: House,
  receipt_long: Receipt,
  receipt: Receipt,
  wrench: Wrench,
  plug: Plug,

  // --- Health ---
  local_hospital: HeartPulse,
  medical_services: Stethoscope,
  heart: HeartPulse,
  fitness_center: Dumbbell,
  gym: Dumbbell,
  spa: Sparkles,

  // --- Education ---
  school: GraduationCap,
  education: GraduationCap,

  // --- Entertainment ---
  sports_esports: Gamepad2,
  entertainment: Gamepad2,
  music: Music,
  tv: Tv,
  laptop: Laptop,
  smartphone: Smartphone,

  // --- Work & finance ---
  work: Briefcase,
  briefcase: Briefcase,
  payments: Banknote,
  banknote: Banknote,
  account_balance: Landmark,
  landmark: Landmark,
  trending_up: TrendingUp,
  trending_down: TrendingDown,
  trending: TrendingUp,
  store: Store,
  coins: Coins,
  dollar: DollarSign,
  activity: Activity,
  wifi: Wifi,
  phone: Phone,
  zap: Zap,

  // --- Gifts & misc ---
  card_giftcard: Gift,
  gift: Gift,
  volunteer_activism: HandHeart,
  replay: RotateCcw,
  security: Shield,
  shield: Shield,
  more_horiz: MoreHorizontal,
  package: Package,
  pets: PawPrint,

  // --- Accounts ---
  account_balance_wallet: Wallet,
  wallet: Wallet,
  savings: PiggyBank,
  piggybank: PiggyBank,
  credit_card: CreditCard,
  creditcard: CreditCard,
  building: Building2,
  bank: Landmark,

  // --- Transaction types ---
  income: TrendingUp,
  expense: TrendingDown,
  transfer: ArrowLeftRight,
  refund: RotateCcw,
  adjustment: Wrench,

  // --- Nav aliases ---
  dashboard: Activity,
  accounts: Wallet,
  transactions: ArrowLeftRight,
  budgets: Target,
  goals: Target,
  recurring: RotateCcw,
  reports: TrendingUp,
  settings: Wrench,
};

export interface IconProps extends Omit<LucideProps, 'name'> {
  /** String identifier (e.g. "restaurant", "wallet", "credit_card") */
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, className, style, ...rest }: IconProps) {
  const Cmp = ICONS[name] ?? ICONS.category;
  return <Cmp aria-hidden={rest['aria-label'] ? undefined : true} className={className} style={style} {...rest} />;
}

export type { LucideProps, SVGProps };
